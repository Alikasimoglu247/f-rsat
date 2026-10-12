import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { listingSchema } from "../validation";
import type { ResearchCandidate, AcquisitionResult } from "./types";
import type { collectResearch } from "./acquisition";
import { segmentContains, researchSegments } from "./strategy";
import { licensedFeed, readLicensedJson } from "../providers/adapters";
import { canonicalUrl } from "../listings";

// A replaceable provider boundary. A documented API adapter can implement the
// same contract; no account, endpoint or scrape is enabled by a config guess.
export interface ResearchProvider {
  tier: "AUTHORIZED_LISTINGS" | "SUPPORTING_CONTEXT";
  read(
    options: Parameters<typeof collectResearch>[0],
  ): Promise<AcquisitionResult>;
}
const date = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const https = z.url().refine((v) => {
  const u = new URL(v);
  return u.protocol === "https:" && !u.username && !u.password;
});
const envelope = z
  .object({
    format: z.literal("firsatradar-authorized-listings"),
    version: z.literal(1),
    source: z
      .object({
        id: z.string().regex(/^[a-z0-9-]{2,60}$/),
        name: z.string().min(2),
        documentationUrl: https,
        grantReference: z.string().min(8),
        allowStorage: z.literal(true),
        allowComparison: z.literal(true),
        allowReuse: z.literal(true),
      })
      .strict(),
    records: z
      .array(
        z
          .object({
            kind: z.literal("LISTING"),
            listing: listingSchema.refine(
              (l) =>
                !l.isDemo &&
                !!l.externalId &&
                !!l.sourceUrl &&
                l.sourceUrl.startsWith("https://"),
            ),
            publishedAt: date,
            sourceUpdatedAt: date.nullable(),
            observedAt: z.iso.datetime({ offset: true }),
            priceVerifiedAt: z.iso.datetime({ offset: true }).nullable(),
            availabilityStatus: z.enum([
              "ACTIVE",
              "REMOVED",
              "SOLD",
              "UNKNOWN",
            ]),
            availabilityVerifiedAt: z.iso.datetime({ offset: true }).nullable(),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export function parseAuthorizedFeed(
  value: unknown,
  grant: { sourceId: string; reference: string },
  options: Parameters<typeof collectResearch>[0] = {},
): AcquisitionResult {
  const feed = envelope.parse(value);
  if (
    feed.source.id !== grant.sourceId ||
    feed.source.grantReference !== grant.reference
  )
    throw new Error("Feed için sunucuda tanımlı kullanım izni eşleşmiyor.");
  const result: AcquisitionResult = {
    sources: [],
    facts: [],
    candidates: [],
    discoveries: [],
    checks: [],
  };
  const segment = researchSegments.find(
    (s) => s.id === (options.segmentId ?? "CENTRAL_HOME"),
  )!;
  for (const r of feed.records) {
    r.listing.sourceUrl = canonicalUrl(r.listing.sourceUrl);
    const l = r.listing,
      id = `authorized-${feed.source.id}-${l.externalId}`;
    const proof = (
      type: "price" | "availability",
      verifiedAt: string | null,
    ) =>
      verifiedAt
        ? {
            method: "AUTHORIZED_FEED",
            reference: feed.source.documentationUrl,
            externalId: l.externalId,
            sourceUrl: l.sourceUrl,
            verifiedAt,
            ...(type === "price"
              ? { price: l.price }
              : { status: r.availabilityStatus }),
          }
        : null;
    const candidate: ResearchCandidate = {
      id,
      sourceId: id,
      sourceUrl: l.sourceUrl!,
      externalId: l.externalId!,
      title: l.title,
      category: l.category,
      province: l.province,
      district: l.district,
      neighborhood: l.neighborhood ?? "",
      transactionType: l.transactionType ?? "",
      publishedAt: r.publishedAt,
      observedAt: r.observedAt,
      pageCheckedAt: r.observedAt,
      sourceUpdatedAt: r.sourceUpdatedAt,
      priceVerifiedAt: r.priceVerifiedAt,
      priceVerification: r.priceVerifiedAt ? "VERIFIED" : "UNVERIFIED",
      availabilityStatus: r.availabilityStatus,
      availabilityVerifiedAt: r.availabilityVerifiedAt,
      verificationEvidence: {
        price: proof("price", r.priceVerifiedAt),
        availability: proof("availability", r.availabilityVerifiedAt),
      },
      price: l.price,
      sizeM2: l.sizeM2 ?? null,
      netM2: l.netM2 ?? null,
      grossM2: l.grossM2 ?? null,
      propertyType: l.propertyType ?? null,
      rooms: l.rooms ?? null,
      buildingAge: l.buildingAge ?? null,
      condition: l.condition ?? null,
      legalStatus: l.legalStatus ?? null,
      earthquakeInfo: l.earthquakeInfo ?? null,
      mortgageEligible: null,
      classification: l.classification ?? null,
      zoning: l.zoning ?? null,
      roadAccess: l.roadAccess ?? null,
      parcelNumber: l.parcelNumber ?? null,
      sharedOwnership: l.sharedOwnership ?? null,
      agriculturalRestrictions: l.agriculturalRestrictions ?? null,
      areaBasis: null,
      factIds: [id + "-offer"],
      features: [],
      limitations: [
        "Yetkili portföy akışı fiyat/satış beyanını sağlar; tapu, imar veya hasar için bağımsız belge değildir.",
      ],
      riskSignals: [],
      ...(l.category === "ARABA"
        ? {
            vehicle: {
              make: l.make,
              model: l.model,
              trim: l.trim,
              modelYear: l.modelYear,
              mileage: l.mileage,
              fuel: l.fuel,
              transmission: l.transmission,
              damageHistory: l.damageHistory,
              bodyType: l.bodyType,
              bodyTypeVerified: l.bodyTypeVerified,
              bodyTypeEvidence: l.bodyTypeEvidence,
            },
          }
        : {}),
    };
    if (!segmentContains(segment, candidate)) continue;
    const hash = createHash("sha256").update(JSON.stringify(r)).digest("hex");
    result.sources.push({
      id,
      providerId: feed.source.id,
      name: feed.source.name,
      url: l.sourceUrl!,
      retrievedAt: r.observedAt,
      kind: "AUTHORIZED_FEED",
      validForDays: 7,
      sha256: hash,
      checkStatus: "VALID",
      usageNote: `Sunucuda eşleşen kullanım izni; saklama, karşılaştırma ve yeniden kullanım hakkı. Dokümantasyon: ${feed.source.documentationUrl}`,
    });
    result.candidates.push(candidate);
    result.facts.push({
      id: id + "-offer",
      sourceId: id,
      label: `${l.externalId}: yetkili akışta ${l.price} TL istenen ilan fiyatı. Değerleme tahmini değildir.`,
      value: null,
      unit: "TL",
      period: r.publishedAt,
      scope: "Tekil yetkili ilan",
    });
    result.checks.push({
      url: l.sourceUrl!,
      status: "PARSED",
      checkedAt: r.observedAt,
      sha256: hash,
      reason:
        "Yetkili yerel feed okundu; internet sayfasına istek gönderilmedi. Özgün teyit tarihleri korundu.",
    });
  }
  return result;
}
export function authorizedFeedStatus() {
  return {
    configured:
      licensedFeed.authorized() ||
      !!(
        process.env.LICENSED_FEED_PATH &&
        process.env.LICENSED_FEED_SOURCE_ID &&
        process.env.LICENSED_FEED_GRANT_REFERENCE
      ),
    method: process.env.LICENSED_FEED_PATH
      ? "AUTHORIZED_JSON_FILE"
      : "AUTHORIZED_HTTPS_JSON",
    liveValidated: false,
  };
}
export const authorizedFileProvider: ResearchProvider = {
  tier: "AUTHORIZED_LISTINGS",
  async read(options) {
    if (!authorizedFeedStatus().configured)
      return {
        sources: [],
        facts: [],
        candidates: [],
        discoveries: [],
        checks: [],
      };
    if (!process.env.LICENSED_FEED_PATH)
      return parseAuthorizedFeed(
        await readLicensedJson(),
        {
          sourceId: process.env.AUTHORIZED_FEED_SOURCE_ID!,
          reference: process.env.AUTHORIZED_FEED_GRANT_REFERENCE!,
        },
        options,
      );
    const path = process.env.LICENSED_FEED_PATH!;
    const meta = await stat(path);
    if (!meta.isFile() || meta.size > 10_000_000)
      throw new Error("Yetkili feed dosyası boyut/biçim sınırını aşıyor.");
    return parseAuthorizedFeed(
      JSON.parse(await readFile(path, "utf8")),
      {
        sourceId: process.env.LICENSED_FEED_SOURCE_ID!,
        reference: process.env.LICENSED_FEED_GRANT_REFERENCE!,
      },
      options,
    );
  },
};
