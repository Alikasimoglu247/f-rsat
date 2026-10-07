import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import type { ListingInput } from "./validation";
import type { Evidence, Assessment } from "./analysis";
import { assess } from "./analysis";

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
function detailFields(input: ListingInput) {
  if (input.category === "EV")
    return {
      property: {
        sizeM2: input.sizeM2,
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
) {
  const sourceUrl = canonicalUrl(input.sourceUrl),
    key = identityKey(input);
  const alternatives: Prisma.ListingWhereInput[] = [{ identityKey: key }];
  if (sourceUrl) alternatives.push({ sourceUrl });
  if (input.externalId)
    alternatives.push({ sourceId, externalId: input.externalId });
  const matches = await tx.listing.findMany({ where: { OR: alternatives } });
  if (matches.length > 1)
    throw new Error(
      "URL/harici kimlik farklı kayıtlara işaret ediyor; elle birleştirme gerekli.",
    );
  const existing = matches[0];
  if (
    existing &&
    (existing.isDemo !== input.isDemo || existing.category !== input.category)
  )
    throw new Error(
      "Aynı kimlik farklı kategori veya demo durumuyla kullanılamaz.",
    );
  const now = new Date();
  const provenance = {
    acquisitionSource: sourceId,
    importJobId: importId ?? null,
    method: sourceId,
    observedAt: now.toISOString(),
    verification: "USER_PROVIDED_UNVERIFIED",
  };
  const details = detailFields(input);
  const common = {
    title: input.title,
    category: input.category,
    province: input.province,
    district: input.district,
    neighborhood: input.neighborhood,
    price: new Prisma.Decimal(input.price),
    lastObservedAt: now,
  };
  if (existing) {
    const changed = !existing.price.equals(input.price);
    await tx.listing.update({
      where: { id: existing.id },
      data: {
        ...common,
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
                create: { price: input.price, observedAt: now, provenance },
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
      prices: { create: { price: input.price, observedAt: now, provenance } },
    },
  });
  return { id: listing.id, outcome: "inserted" as const };
}
export async function importRecords(
  records: ListingInput[],
  sourceId: string,
  format: string,
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
          ids: [] as string[],
        };
        for (const record of records) {
          const saved = await saveRecord(tx, record, sourceId, job.id);
          result.ids.push(saved.id);
          if (saved.outcome === "inserted") result.inserted++;
          else if (saved.outcome === "updated") result.updated++;
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
            accessStatus:
              sourceId === "demo"
                ? "DEMO"
                : sourceId === "licensed-feed"
                  ? "CONNECTED"
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
  const listings = await tx.listing.findMany({ include: listingInclude });
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
