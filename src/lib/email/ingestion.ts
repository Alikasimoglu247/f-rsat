import { Prisma } from "@prisma/client";
import { db } from "../db";
import { saveRecord } from "../listings";
import { listingSchema } from "../validation";
import { ensureSources } from "../providers/registry";
import { HttpError } from "../http";
import { parseEml, PARSER_VERSION, digest } from "./parser";
import type { EmailProposal } from "./parser";

type StoredProposal = EmailProposal & {
  processed?: boolean;
  outcome?: string;
  listingId?: string;
  reviewId?: string;
};
export async function recordUnreadableGmail(
  raw: Buffer,
  sender: string,
  deliveryKey: string,
  time: Date,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451810)::text`;
    const contentHash = digest(
      `unreadable|${sender}|${raw.toString("base64")}`,
    );
    const existing = await tx.emailMessage.findUnique({
      where: { contentHash },
    });
    const message =
      existing ??
      (await tx.emailMessage.create({
        data: {
          contentHash,
          transport: "GMAIL",
          sender,
          subject: "Ayrıştırılamayan seçili bildirim",
          status: "ERROR",
          receivedAt:
            Number.isFinite(time.getTime()) &&
            time.getTime() <= Date.now() + 300_000
              ? time
              : null,
          seenViaGmailAt: new Date(),
          proposals: [],
          errors: [
            "Seçili mesaj MIME/gönderici/boyut kontrolünden geçmedi. İçerik aktarılmadı; izinli orijinal dosyayı inceleyin.",
          ],
        },
      }));
    await tx.emailDelivery.upsert({
      where: { key: deliveryKey },
      create: { key: deliveryKey, messageId: message.id },
      update: {},
    });
    return { message, replayed: !!existing };
  });
}
async function processReceipt(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(451807)::text`;
  const message = await tx.emailMessage.findUniqueOrThrow({ where: { id } });
  const proposals = message.proposals as unknown as StoredProposal[];
  let inserted = message.inserted,
    updated = message.updated,
    duplicates = message.duplicates,
    reviewed = message.reviewed;
  for (const item of proposals) {
    if (item.processed || item.missing.length) continue;
    const template = await tx.emailTemplate.findUnique({
      where: { id: item.templateId },
    });
    if (
      !template ||
      template.status !== "USER_APPROVED" ||
      template.sender !== message.sender ||
      template.parserVersion !== PARSER_VERSION
    )
      continue;
    const input = listingSchema.parse(item.fields);
    const job = await tx.importJob.create({
      data: {
        sourceId: item.providerId,
        format: message.transport,
        status: "RUNNING",
        total: 1,
        errors: [],
      },
    });
    const saved = await saveRecord(tx, input, item.providerId, job.id, {
      observedAt: message.receivedAt ?? message.createdAt,
      provenance: {
        emailReceiptId: id,
        transport: message.transport,
        verification: "EMAIL_FIELDS_UNVERIFIED",
        timestampOrigin:
          message.transport === "GMAIL"
            ? "GMAIL_INTERNAL_DATE"
            : message.receivedAt
              ? "EMAIL_DATE_UNVERIFIED"
              : "COLLECTION_TIME",
        templateId: item.templateId,
      },
    });
    const counts = {
      inserted: +(saved.outcome === "inserted"),
      updated: +(saved.outcome === "updated"),
      duplicates: +(saved.outcome === "duplicate"),
      reviewed: +(saved.outcome === "reviewed"),
    };
    inserted += counts.inserted;
    updated += counts.updated;
    duplicates += counts.duplicates;
    reviewed += counts.reviewed;
    item.processed = true;
    item.outcome = saved.outcome;
    item.listingId = saved.id;
    if ("reviewId" in saved) item.reviewId = saved.reviewId;
    await tx.importJob.update({
      where: { id: job.id },
      data: { ...counts, status: "COMPLETED", completedAt: new Date() },
    });
    if (saved.outcome !== "reviewed") {
      if (message.seenViaGmailAt)
        await tx.emailTemplate.update({
          where: { id: template.id },
          data: { liveValidatedAt: new Date() },
        });
      await tx.listingSource.update({
        where: { id: item.providerId },
        data: {
          lastSuccessAt: new Date(),
          lastError: null,
          accessStatus: message.seenViaGmailAt ? "CONNECTED" : "USER_APPROVED",
          lastNewCount: counts.inserted,
        },
      });
    }
    await tx.sourceSyncLog.create({
      data: {
        sourceId: item.providerId,
        status: saved.outcome === "reviewed" ? "REVIEW" : "SUCCESS",
        message: `${message.transport}: ${counts.inserted} yeni, ${counts.updated} fiyat gözlemi, ${counts.duplicates} tekrar, ${counts.reviewed} kimlik incelemesi.`,
      },
    });
  }
  const complete =
    proposals.length > 0 &&
    proposals.every((p) => p.processed && p.outcome !== "reviewed") &&
    (message.errors as unknown[]).length === 0;
  const status = complete
    ? "IMPORTED"
    : inserted + updated + duplicates > 0
      ? "PARTIAL"
      : proposals.length
        ? "NEEDS_REVIEW"
        : "UNSUPPORTED";
  return tx.emailMessage.update({
    where: { id },
    data: {
      status,
      proposals: proposals as unknown as Prisma.InputJsonValue,
      inserted,
      updated,
      duplicates,
      reviewed,
      processedAt: new Date(),
    },
  });
}
export async function ingestEml(
  raw: Buffer,
  options: {
    transport?: "EML" | "GMAIL";
    deliveryKey?: string;
    receivedAt?: Date;
    expectedSender?: string;
  } = {},
) {
  let parsed;
  try {
    parsed = await parseEml(raw);
  } catch {
    throw new HttpError(400, "EML ayrıştırılamadı veya 2 MB sınırını aşıyor.");
  }
  if (options.expectedSender && options.expectedSender !== parsed.sender)
    throw new HttpError(
      400,
      "E-posta göndericisi seçilen metadata ile eşleşmiyor.",
    );
  await ensureSources(db);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(451810)::text`;
      const delivery = options.deliveryKey
        ? await tx.emailDelivery.findUnique({
            where: { key: options.deliveryKey },
            include: { message: true },
          })
        : null;
      const delivered = delivery?.message;
      if (delivered && delivered.contentHash !== parsed.contentHash)
        throw new HttpError(
          409,
          "Aynı e-posta kimliği farklı içerikle geldi; değiştirilmedi.",
        );
      const existing =
        delivered ??
        (await tx.emailMessage.findUnique({
          where: { contentHash: parsed.contentHash },
        }));
      if (existing) {
        if (options.deliveryKey && !delivery)
          await tx.emailDelivery.create({
            data: { key: options.deliveryKey, messageId: existing.id },
          });
        if (options.transport === "GMAIL") {
          await tx.emailMessage.update({
            where: { id: existing.id },
            data: { seenViaGmailAt: new Date() },
          });
          if (existing.status === "IMPORTED")
            for (const templateId of existing.templateIds) {
              const template = await tx.emailTemplate.findUnique({
                where: { id: templateId },
              });
              if (template?.status === "USER_APPROVED") {
                await tx.emailTemplate.update({
                  where: { id: templateId },
                  data: { liveValidatedAt: new Date() },
                });
                await tx.listingSource.update({
                  where: { id: template.providerId },
                  data: { accessStatus: "CONNECTED" },
                });
              }
            }
        }
        return { message: existing, replayed: true };
      }
      const time = options.receivedAt ?? parsed.receivedAt;
      if (
        time &&
        (!Number.isFinite(time.getTime()) ||
          time.getTime() > Date.now() + 300_000)
      )
        throw new HttpError(400, "Geçersiz e-posta zamanı.");
      const created = await tx.emailMessage.create({
        data: {
          contentHash: parsed.contentHash,
          deliveryKey: options.deliveryKey,
          transport: options.transport ?? "EML",
          seenViaGmailAt:
            options.transport === "GMAIL" ? new Date() : undefined,
          sender: parsed.sender,
          subject: parsed.subject,
          receivedAt: time,
          providerId: parsed.proposals[0]?.providerId,
          status: "NEEDS_REVIEW",
          proposals: parsed.proposals as unknown as Prisma.InputJsonValue,
          errors: parsed.errors,
          templateIds: [...new Set(parsed.proposals.map((p) => p.templateId))],
        },
      });
      if (options.deliveryKey)
        await tx.emailDelivery.create({
          data: { key: options.deliveryKey, messageId: created.id },
        });
      return { message: await processReceipt(tx, created.id), replayed: false };
    },
    { timeout: 60_000 },
  );
}
export async function approveMessage(id: string) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(451810)::text`;
      const message = await tx.emailMessage.findUnique({ where: { id } });
      if (!message) throw new HttpError(404, "Bildirim bulunamadı.");
      const proposals = message.proposals as unknown as StoredProposal[];
      if (
        !message.sender ||
        !proposals.length ||
        (message.errors as unknown[]).length ||
        proposals.some((p) => p.missing.length)
      )
        throw new HttpError(
          400,
          "Eksik veya belirsiz alanlar var; bu örnek otomatik aktarım için onaylanamaz.",
        );
      for (const proposal of proposals)
        await tx.emailTemplate.upsert({
          where: { id: proposal.templateId },
          create: {
            id: proposal.templateId,
            providerId: proposal.providerId,
            sender: message.sender,
            parserVersion: PARSER_VERSION,
            sampleMessageId: id,
          },
          update: { status: "USER_APPROVED" },
        });
      return processReceipt(tx, id);
    },
    { timeout: 60_000 },
  );
}
export async function reprocessMessage(id: string) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(451810)::text`;
      if (!(await tx.emailMessage.findUnique({ where: { id } })))
        throw new HttpError(404, "Bildirim bulunamadı.");
      return processReceipt(tx, id);
    },
    { timeout: 60_000 },
  );
}
export async function resolveIdentityReview(
  id: string,
  action: "DISMISS" | "CREATE_SEPARATE",
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451807)::text`;
    const review = await tx.listingReview.findUnique({ where: { id } });
    if (!review) throw new HttpError(404, "İnceleme bulunamadı.");
    if (review.status !== "PENDING") return review;
    if (action === "CREATE_SEPARATE") {
      if (review.kind !== "WEAK_IDENTITY")
        throw new HttpError(
          400,
          "Çelişen güçlü kimlikler ayrı kayıt olarak kopyalanamaz; kaynağı düzeltin.",
        );
      await saveRecord(
        tx,
        listingSchema.parse(review.input),
        review.sourceId,
        undefined,
        {
          allowWeakCreate: true,
          provenance: { identityReviewId: id, explicitlySeparate: true },
        },
      );
    }
    return tx.listingReview.update({
      where: { id },
      data: {
        status: action === "DISMISS" ? "DISMISSED" : "SEPARATE_CREATED",
        resolvedAt: new Date(),
      },
    });
  });
}
