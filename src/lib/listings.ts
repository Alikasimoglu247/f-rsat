import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import type { ListingInput } from "./validation";
import type { Evidence, Assessment } from "./analysis";
import { assess } from "./analysis";
import { normalizeBodyType } from "./constants";
import { queueBodyReview } from "./vehicle-review";
import { HttpError } from "./http";

export const listingInclude = {
  source: true,
  property: true,
  vehicle: true,
  land: true,
  prices: { orderBy: { observedAt: "asc" as const } },
  assessment: true,
  watch: true,
} satisfies Prisma.ListingInclude;
export type StoredListing = Prisma.ListingGetPayload<{
  include: typeof listingInclude;
}>;
export function evidence(listing: StoredListing): Evidence {
  return JSON.parse(JSON.stringify(listing)) as Evidence;
}
export function canonicalUrl(value?: string) {
  if (!value) return undefined;
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key))
      url.searchParams.delete(key);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url.toString();
}
export function identityKey(input: ListingInput) {
  // Similarity fingerprint only. Never a globally unique listing identity.
  const {
    price: _price,
    sourceUrl: _url,
    externalId: _external,
    ...identity
  } = input;
  void _price;
  void _url;
  void _external;
  const normalized = Object.fromEntries(
    Object.entries(identity)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [
        key,
        typeof value === "string"
          ? value.normalize("NFC").trim().toLocaleLowerCase("tr-TR")
          : value,
      ]),
  );
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
export type ObservationContext = {
  observedAt?: Date;
  provenance?: Record<string, string | boolean | null>;
  allowWeakCreate?: boolean;
};
async function identityReview(
  tx: Prisma.TransactionClient,
  input: ListingInput,
  sourceId: string,
  candidates: string[],
  kind: string,
  reason: string,
) {
  const dedupKey = createHash("sha256")
    .update(
      JSON.stringify({
        sourceId,
        input,
        candidates: [...candidates].sort(),
        kind,
      }),
    )
    .digest("hex");
  const review = await tx.listingReview.upsert({
    where: { dedupKey },
    create: {
      sourceId,
      kind,
      reason,
      dedupKey,
      input: JSON.parse(JSON.stringify(input)),
      candidateIds: candidates,
    },
    update: {},
  });
  return { id: "", reviewId: review.id, outcome: "reviewed" as const };
}
function detailFields(input: ListingInput) {
  if (input.category === "EV")
    return {
      property: {
        sizeM2: input.sizeM2,
        netM2: input.netM2,
        grossM2: input.grossM2,
        propertyType: input.propertyType,
        rooms: input.rooms,
        buildingAge: input.buildingAge,
        condition: input.condition,
        legalStatus: input.legalStatus,
        earthquakeInfo: input.earthquakeInfo,
      },
    };
  if (input.category === "ARABA")
    return {
      vehicle: {
        make: input.make,
        model: input.model,
        trim: input.trim,
        modelYear: input.modelYear,
        mileage: input.mileage,
        fuel: input.fuel,
        transmission: input.transmission,
        damageHistory: input.damageHistory,
        bodyType: input.bodyType,
        bodyTypeVerified: input.bodyTypeVerified,
        bodyTypeEvidence: input.bodyTypeEvidence,
      },
    };
  return {
    land: {
      sizeM2: input.sizeM2,
      classification: input.classification,
      zoning: input.zoning,
      roadAccess: input.roadAccess,
      parcelNumber: input.parcelNumber,
      sharedOwnership: input.sharedOwnership,
      agriculturalRestrictions: input.agriculturalRestrictions,
    },
  };
}
export async function saveRecord(
  tx: Prisma.TransactionClient,
  input: ListingInput,
  sourceId: string,
  importId?: string,
  context: ObservationContext = {},
) {
  const sourceUrl = canonicalUrl(input.sourceUrl),
    key = identityKey(input);
  const byId = input.externalId
    ? await tx.listing.findUnique({
        include: { vehicle: true },
        where: {
          sourceId_externalId: { sourceId, externalId: input.externalId },
        },
      })
    : null;
  const byUrl = sourceUrl
    ? await tx.listing.findUnique({
        include: { vehicle: true },
        where: { sourceId_sourceUrl: { sourceId, sourceUrl } },
      })
    : null;
  if (
    byId?.sourceUrl &&
    sourceUrl &&
    new URL(byId.sourceUrl).hostname.toLowerCase().replace(/^www\./, "") !==
      new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "")
  )
    return identityReview(
      tx,
      input,
      sourceId,
      [byId.id],
      "IDENTITY_CONFLICT",
      "Aynı içe aktarma kaynağındaki harici ID farklı platform alan adlarıyla geldi; kaynak ayrımı incelenmeden birleştirilmedi.",
    );
  if (
    (byId && byUrl && byId.id !== byUrl.id) ||
    (byUrl?.externalId &&
      input.externalId &&
      byUrl.externalId !== input.externalId)
  )
    return identityReview(
      tx,
      input,
      sourceId,
      [...new Set([byId?.id, byUrl?.id].filter((id): id is string => !!id))],
      "IDENTITY_CONFLICT",
      "Aynı kaynağın ilan ID ve URL bilgileri çelişiyor; otomatik birleşme yapılmadı.",
    );
  const existing = byId ?? byUrl;
  if (
    !existing &&
    !sourceUrl &&
    !input.externalId &&
    !context.allowWeakCreate
  ) {
    const similar = await tx.listing.findMany({
      where: { sourceId, identityKey: key },
      select: { id: true },
    });
    if (similar.length)
      return identityReview(
        tx,
        input,
        sourceId,
        similar.map((item) => item.id),
        "WEAK_IDENTITY",
        "Benzer içerik tek başına ilan kimliği değildir. Ayrı ilan olup olmadığını inceleyin.",
      );
  }
  if (
    existing &&
    (existing.isDemo !== input.isDemo || existing.category !== input.category)
  )
    return identityReview(
      tx,
      input,
      sourceId,
      [existing.id],
      "IDENTITY_CONFLICT",
      "Aynı güçlü kimlik farklı kategori veya demo durumuyla geldi; kayıt değiştirilmedi.",
    );
  if (existing?.identityStatus === "REVIEW")
    return identityReview(
      tx,
      input,
      sourceId,
      [existing.id],
      "LEGACY_AMBIGUITY",
      "Eski kaydın kimliği inceleme bekliyor; otomatik güncellenmedi.",
    );
  const now = new Date();
  const observedAt = context.observedAt ?? now;
  if (
    !Number.isFinite(observedAt.getTime()) ||
    observedAt.getTime() > now.getTime() + 300_000
  )
    throw new Error("Geçersiz gözlem zamanı.");
  const provenance = {
    acquisitionSource: sourceId,
    importJobId: importId ?? null,
    method: sourceId,
    observedAt: observedAt.toISOString(),
    collectedAt: now.toISOString(),
    verification: "USER_PROVIDED_UNVERIFIED",
    originalSourceUrl: input.sourceUrl ?? null,
    ...context.provenance,
  };
  const details = detailFields(input);
  if (
    input.bodyTypeVerified &&
    (!normalizeBodyType(input.bodyType) ||
      !input.bodyTypeEvidence ||
      input.bodyTypeEvidence.trim().length < 8)
  )
    throw new HttpError(
      400,
      "Gövde tipini doğrulamak için geçerli sınıf ve incelenmiş kanıt açıklaması gerekli.",
    );
  if (
    details.vehicle &&
    (input.bodyTypeVerified === false ||
      (input.bodyType &&
        input.bodyType !== existing?.vehicle?.bodyType &&
        input.bodyTypeVerified !== true))
  ) {
    details.vehicle.bodyTypeVerified = false;
    details.vehicle.bodyTypeEvidence = undefined;
  }
  const common = {
    title: input.title,
    category: input.category,
    province: input.province,
    district: input.district,
    neighborhood: input.neighborhood,
    transactionType: input.transactionType,
    price: new Prisma.Decimal(input.price),
    lastObservedAt: observedAt,
  };
  if (existing) {
    const changed = !existing.price.equals(input.price);
    const current = observedAt.getTime() >= existing.lastObservedAt.getTime();
    if (!current) {
      const recorded = await tx.listingPriceHistory.findFirst({
        where: { listingId: existing.id, price: input.price, observedAt },
      });
      if (!recorded)
        await tx.listingPriceHistory.create({
          data: {
            listingId: existing.id,
            price: input.price,
            observedAt,
            provenance,
          },
        });
      if (!recorded)
        await tx.opportunityAssessment.deleteMany({
          where: { listingId: existing.id },
        });
      return {
        id: existing.id,
        outcome: recorded ? ("duplicate" as const) : ("updated" as const),
      };
    }
    await tx.listing.update({
      where: { id: existing.id },
      data: {
        ...common,
        identityKey: key,
        identityVersion: 2,
        ...(existing.externalId || !input.externalId
          ? {}
          : { externalId: input.externalId }),
        ...(existing.sourceUrl || !sourceUrl ? {} : { sourceUrl }),
        ...(details.property
          ? {
              property: {
                upsert: { create: details.property, update: details.property },
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
          ? { land: { upsert: { create: details.land, update: details.land } } }
          : {}),
        ...(changed
          ? {
              prices: {
                create: { price: input.price, observedAt, provenance },
              },
            }
          : {}),
      },
    });
    // Önbellekteki değerlendirme artık güncel olmayabilir; sonraki iş yeniden üretir.
    await tx.opportunityAssessment.deleteMany({
      where: { listingId: existing.id },
    });
    await tx.comparableListing.deleteMany({
      where: {
        OR: [{ listingId: existing.id }, { comparableId: existing.id }],
      },
    });
    await queueBodyReview(tx, existing.id);
    return {
      id: existing.id,
      outcome: changed ? "updated" : ("duplicate" as const),
    };
  }
  const listing = await tx.listing.create({
    data: {
      ...common,
      sourceUrl,
      externalId: input.externalId,
      identityKey: key,
      sourceId,
      isDemo: input.isDemo,
      provenance,
      ...(details.property ? { property: { create: details.property } } : {}),
      ...(details.vehicle ? { vehicle: { create: details.vehicle } } : {}),
      ...(details.land ? { land: { create: details.land } } : {}),
      prices: { create: { price: input.price, observedAt, provenance } },
    },
  });
  await queueBodyReview(tx, listing.id);
  return { id: listing.id, outcome: "inserted" as const };
}
export async function importRecords(
  records: ListingInput[],
  sourceId: string,
  format: string,
  context: ObservationContext = {},
) {
  const job = await db.importJob.create({
    data: {
      sourceId,
      format,
      status: "RUNNING",
      total: records.length,
      errors: [],
    },
  });
  try {
    const counts = await db.$transaction(
      async (tx) => {
        // Lock imports/manual writes together; concurrent copies cannot create duplicate identities.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(451807)::text`;
        const result = {
          inserted: 0,
          updated: 0,
          duplicates: 0,
          reviewed: 0,
          ids: [] as string[],
        };
        for (const record of records) {
          const saved = await saveRecord(tx, record, sourceId, job.id, context);
          if (saved.id) result.ids.push(saved.id);
          if (saved.outcome === "inserted") result.inserted++;
          else if (saved.outcome === "updated") result.updated++;
          else if (saved.outcome === "reviewed") result.reviewed++;
          else result.duplicates++;
        }
        const { ids: _ids, ...totals } = result;
        void _ids;
        await tx.importJob.update({
          where: { id: job.id },
          data: { ...totals, status: "COMPLETED", completedAt: new Date() },
        });
        await tx.listingSource.update({
          where: { id: sourceId },
          data: {
            lastSuccessAt: new Date(),
            lastError: null,
            lastNewCount: result.inserted,
            accessStatus:
              sourceId === "demo"
                ? "DEMO"
                : sourceId === "licensed-feed"
                  ? "CONNECTED"
                  : ["sahibinden-email", "arabam-email"].includes(sourceId)
                    ? "USER_APPROVED"
                    : "AVAILABLE",
          },
        });
        return result;
      },
      { timeout: 60_000 },
    );
    return { jobId: job.id, ...counts };
  } catch (error) {
    await db.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errors: [
          {
            message:
              error instanceof Error ? error.message : "İçe aktarma başarısız.",
          },
        ],
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
export async function analyzeAll(tx: Prisma.TransactionClient) {
  const listings = await tx.listing.findMany({
    where: { identityStatus: "ACTIVE" },
    include: listingInclude,
  });
  const inputs = listings.map(evidence);
  for (const listing of inputs) {
    const result = assess(listing, inputs);
    const { comparables, riskFlags, ...fields } = result;
    const data = {
      ...fields,
      riskFlags: riskFlags as unknown as Prisma.InputJsonValue,
      assessedAt: new Date(),
    };
    await tx.opportunityAssessment.upsert({
      where: { listingId: listing.id },
      create: { listingId: listing.id, ...data },
      update: data,
    });
    await tx.comparableListing.deleteMany({ where: { listingId: listing.id } });
    if (comparables.length)
      await tx.comparableListing.createMany({
        data: comparables.map((item) => ({
          listingId: listing.id,
          comparableId: item.id,
          normalizedPrice: item.normalizedPrice,
          reason: item.reason,
        })),
      });
  }
  return listings.length;
}
export type ListingView = Evidence & {
  sourceUrl: string | null;
  externalId: string | null;
  collectedAt: string;
  createdAt: string;
  neighborhood: string | null;
  provenance: Record<string, unknown>;
  source: { name: string; method: string };
  watch: { createdAt: string } | null;
  assessment: (Omit<Assessment, "comparables"> & { assessedAt: string }) | null;
};
