import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { listingSchema } from "../validation";
import { detailFields, listingInclude } from "../listings";
import type { ListingInput } from "../validation";
import { queueBodyReview } from "../vehicle-review";
import { listingReference } from "./parser";
import type { EmailProposal } from "./parser";
import { HttpError } from "../http";
export const correctionSchema = z
  .object({
    messageId: z.string().min(1),
    proposalIndex: z.number().int().min(0).max(99),
    fields: listingSchema
      .omit({ isDemo: true, bodyTypeVerified: true })
      .partial(),
    evidenceNote: z.string().trim().min(8).max(300),
    reviewed: z.literal(true),
  })
  .strict();
type Proposal = EmailProposal & {
  processed?: boolean;
  listingId?: string;
  userCompletedAt?: string;
  correctionIds?: string[];
};
const empty = (v: unknown) =>
  v == null ||
  v === "" ||
  ["bilinmiyor", "unknown", "doğrulanmadı"].includes(
    String(v).trim().toLocaleLowerCase("tr-TR"),
  );
export async function correctEmailFields(
  input: z.infer<typeof correctionSchema>,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451810)::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451807)::text`;
    const m = await tx.emailMessage.findUnique({
      where: { id: input.messageId },
    });
    if (!m) throw new HttpError(404, "Bildirim bulunamadı.");
    const proposals = m.proposals as unknown as Proposal[],
      p = proposals[input.proposalIndex];
    if (!p)
      throw new HttpError(
        400,
        "Ayrıştırılmış ilan önerisi yok. Gerçek orijinal .eml dosyasını yükleyin.",
      );
    const patch = Object.fromEntries(
      Object.entries(input.fields).filter(([, v]) => v !== undefined),
    );
    if (!Object.keys(patch).length)
      throw new HttpError(400, "Tamamlanacak alan seçilmedi.");
    if ("isDemo" in patch || "bodyTypeVerified" in patch)
      throw new HttpError(
        400,
        "Gerçek veri veya gövde doğrulama durumu bu işlemle değiştirilemez.",
      );
    for (const [field, value] of Object.entries(patch))
      if (
        !empty(p.fields[field as keyof ListingInput]) &&
        String(p.fields[field as keyof ListingInput]) !== String(value)
      )
        throw new HttpError(
          400,
          "Mevcut çıkarılan alanlar üzerine yazılamaz; yalnızca eksik alanları tamamlayın.",
        );
    const before = JSON.parse(JSON.stringify(p.fields)),
      merged = { ...p.fields, ...patch };
    const ref = merged.sourceUrl ? listingReference(merged.sourceUrl) : null;
    if (
      !ref ||
      ref.providerId !== p.providerId ||
      merged.externalId !== ref.externalId
    )
      throw new HttpError(
        400,
        "Kaynak URL ve harici ilan kimliği doğrulanamadı.",
      );
    const parsed = listingSchema.safeParse(merged);
    p.fields = merged;
    p.missing = parsed.success
      ? []
      : [...new Set(parsed.error.issues.map((i) => i.path.join(".")))];
    if (p.processed && p.listingId) {
      const l = await tx.listing.findUniqueOrThrow({
        where: { id: p.listingId },
        include: listingInclude,
      });
      const flattened = { ...l, ...l.property, ...l.vehicle, ...l.land };
      for (const [field, value] of Object.entries(patch)) {
        const old = flattened[field as keyof typeof flattened];
        if (!empty(old) && String(old) !== String(value))
          throw new HttpError(
            409,
            "İlanın güncel alanı dolu; eski e-postadan üzerine yazılamaz.",
          );
      }
      const details = detailFields({
        ...patch,
        category: l.category,
      } as ListingInput);
      await tx.listing.update({
        where: { id: l.id },
        data: {
          neighborhood: input.fields.neighborhood,
          transactionType: input.fields.transactionType,
          ...(details.property
            ? {
                property: {
                  upsert: {
                    create: details.property,
                    update: details.property,
                  },
                },
              }
            : {}),
          ...(details.vehicle
            ? {
                vehicle: {
                  upsert: { create: details.vehicle, update: details.vehicle },
                },
              }
            : {}),
          ...(details.land
            ? {
                land: {
                  upsert: { create: details.land, update: details.land },
                },
              }
            : {}),
        },
      });
      await tx.opportunityAssessment.deleteMany({ where: { listingId: l.id } });
      await tx.comparableListing.deleteMany({
        where: { OR: [{ listingId: l.id }, { comparableId: l.id }] },
      });
      await queueBodyReview(tx, l.id);
    }
    const correction = await tx.emailFieldCorrection.create({
      data: {
        messageId: m.id,
        proposalIndex: input.proposalIndex,
        before,
        after: merged as Prisma.InputJsonValue,
        evidenceNote: input.evidenceNote,
      },
    });
    p.userCompletedAt = new Date().toISOString();
    p.correctionIds = [...(p.correctionIds ?? []), correction.id];
    return tx.emailMessage.update({
      where: { id: m.id },
      data: { proposals: proposals as unknown as Prisma.InputJsonValue },
    });
  });
}
