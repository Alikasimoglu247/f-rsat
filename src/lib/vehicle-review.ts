import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { normalizeBodyType } from "./constants";
import { z } from "zod";
import { bodyTypes } from "./constants";
import { HttpError } from "./http";

export async function queueBodyReview(
  tx: Prisma.TransactionClient,
  listingId: string,
) {
  const l = await tx.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { vehicle: true },
  });
  if (l.isDemo || l.category !== "ARABA") return;
  const good = !!(
    l.vehicle?.bodyTypeVerified &&
    normalizeBodyType(l.vehicle.bodyType) &&
    l.vehicle.bodyTypeEvidence
  );
  if (good) {
    await tx.listingReview.updateMany({
      where: { dedupKey: `body-type:${listingId}`, status: "PENDING" },
      data: { status: "VERIFIED", resolvedAt: new Date() },
    });
    return;
  }
  await tx.listingReview.upsert({
    where: { dedupKey: `body-type:${listingId}` },
    create: {
      sourceId: l.sourceId,
      kind: "VEHICLE_BODY_TYPE",
      reason:
        "Gövde tipi için doğrulanmış kanıt yok. SUV sınıflandırmasına alınmadan önce kaynak bilgisini inceleyin; marka/model veya başlıktan tahmin yapılmaz.",
      dedupKey: `body-type:${listingId}`,
      input: {
        title: l.title,
        listingId,
        bodyType: l.vehicle?.bodyType ?? null,
      },
      candidateIds: [listingId],
    },
    update: {
      status: "PENDING",
      resolvedAt: null,
      input: {
        title: l.title,
        listingId,
        bodyType: l.vehicle?.bodyType ?? null,
      },
    },
  });
}
export const bodyReviewSchema = z
  .object({
    bodyType: z.enum(bodyTypes),
    bodyTypeEvidence: z.string().trim().min(8).max(300),
    evidenceReviewed: z.literal(true),
  })
  .strict();
export async function verifyBodyType(
  listingId: string,
  input: z.infer<typeof bodyReviewSchema>,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451807)::text`;
    const l = await tx.listing.findUnique({ where: { id: listingId } });
    if (!l || l.category !== "ARABA")
      throw new HttpError(404, "Araç ilanı bulunamadı.");
    await tx.vehicleDetails.upsert({
      where: { listingId },
      create: {
        listingId,
        bodyType: input.bodyType,
        bodyTypeEvidence: input.bodyTypeEvidence,
        bodyTypeVerified: true,
      },
      update: {
        bodyType: input.bodyType,
        bodyTypeEvidence: input.bodyTypeEvidence,
        bodyTypeVerified: true,
      },
    });
    await tx.listing.update({
      where: { id: listingId },
      data: { updatedAt: new Date() },
    });
    await tx.opportunityAssessment.deleteMany({ where: { listingId } });
    await tx.comparableListing.deleteMany({
      where: { OR: [{ listingId }, { comparableId: listingId }] },
    });
    await queueBodyReview(tx, listingId);
    return { verified: true };
  });
}
