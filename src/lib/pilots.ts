import { Prisma } from "@prisma/client";
import type { PrismaClient, SearchProfile } from "@prisma/client";
import { provinces, pilotFuels, normalizeBodyType } from "./constants";
import { listingInclude } from "./listings";
import type { StoredListing } from "./listings";
import { recentPriceDrops } from "./price-drops";
import { missingListingFields, comparableStatus } from "./listing-quality";
import { intakeFunnel, attributedReceipt } from "./intake-funnel";

export const pilotDefaults = [
  {
    id: "pilot-silivri",
    pilotKey: "SILIVRI",
    name: "Silivri Gayrimenkul Fırsatları",
    categories: ["EV", "ARSA", "TARLA"] as const,
    provinces: ["İstanbul"],
    province: "İstanbul",
    district: "Silivri",
    transactionType: "SATILIK",
    bodyTypes: [],
    fuels: [],
    trackPriceDrops: true,
  },
  {
    id: "pilot-marmara-suv",
    pilotKey: "MARMARA_SUV",
    name: "Marmara SUV Fırsatları",
    categories: ["ARABA"] as const,
    provinces: [...provinces],
    bodyTypes: ["SUV", "CROSSOVER"],
    fuels: [...pilotFuels],
    trackPriceDrops: true,
  },
];
export async function ensurePilotProfiles(
  client: PrismaClient | Prisma.TransactionClient,
) {
  for (const defaults of pilotDefaults) {
    const { categories, ...data } = defaults;
    await client.searchProfile.upsert({
      where: { pilotKey: defaults.pilotKey },
      create: {
        ...data,
        categories: [...categories],
        alerts: { create: { id: `${defaults.id}-alert`, minScore: 70 } },
      },
      update: {},
    });
  }
}
const norm = (v?: string | null) =>
  v?.normalize("NFC").trim().toLocaleLowerCase("tr-TR");
const fuel = (v?: string | null) => {
  const n = norm(v);
  return n === "benzinli"
    ? "benzin"
    : n === "hibrit" || n === "hybrid"
      ? "hibrit"
      : n;
};
export function matchesProfile(listing: StoredListing, profile: SearchProfile) {
  const cats = profile.categories.length
    ? profile.categories
    : profile.category
      ? [profile.category]
      : [];
  const regions = profile.provinces.length
    ? profile.provinces
    : profile.province
      ? [profile.province]
      : [];
  const body = normalizeBodyType(listing.vehicle?.bodyType);
  return (
    (!cats.length || cats.includes(listing.category)) &&
    (!regions.length ||
      regions.some((p) => norm(p) === norm(listing.province))) &&
    (!profile.district || norm(profile.district) === norm(listing.district)) &&
    (!profile.transactionType ||
      norm(profile.transactionType) === norm(listing.transactionType)) &&
    (!profile.bodyTypes.length ||
      !!(
        listing.vehicle?.bodyTypeVerified &&
        listing.vehicle.bodyTypeEvidence &&
        body &&
        profile.bodyTypes.includes(body)
      )) &&
    (!profile.fuels.length ||
      profile.fuels.some((f) => fuel(f) === fuel(listing.vehicle?.fuel))) &&
    (!profile.minPrice || listing.price.gte(profile.minPrice)) &&
    (!profile.maxPrice || listing.price.lte(profile.maxPrice))
  );
}
export function istanbulDayStart(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${day}T00:00:00+03:00`);
}
export function hasPriceDrop(listing: StoredListing) {
  return listing.prices.some(
    (p) => p.observedAt <= listing.lastObservedAt && p.price.gt(listing.price),
  );
}
export async function pilotSummaries(
  client: PrismaClient | Prisma.TransactionClient,
  now = new Date(),
) {
  const [profiles, listings, receipts, reviews] = await Promise.all([
    client.searchProfile.findMany({
      where: { pilotKey: { not: null } },
      include: { alerts: true },
      orderBy: { id: "desc" },
    }),
    client.listing.findMany({
      where: { isDemo: false },
      include: listingInclude,
    }),
    client.emailMessage.findMany(),
    client.listingReview.findMany({ where: { status: "PENDING" } }),
  ]);
  return profiles.map((profile) => {
    const selected = listings.filter(
      (l) => l.identityStatus === "ACTIVE" && matchesProfile(l, profile),
    );
    const threshold = profile.alerts[0]?.minScore ?? 70;
    const opportunities = selected
      .filter(
        (l) =>
          l.assessment?.score != null &&
          missingListingFields(l).length === 0 &&
          l.assessment.score >= threshold &&
          l.assessment.confidence !== "INSUFFICIENT" &&
          l.assessment.sampleCount >= 5 &&
          l.assessment.assessedAt >= l.updatedAt &&
          now.getTime() - l.lastObservedAt.getTime() <= 30 * 86400_000,
      )
      .sort((a, b) => (b.assessment!.score ?? 0) - (a.assessment!.score ?? 0));
    // A global mailbox scan does not prove this pilot received matching real records.
    const receiptIds = new Set(
      selected.flatMap((l) =>
        [l.provenance, ...l.prices.map((p) => p.provenance)].flatMap((p) =>
          p &&
          typeof p === "object" &&
          !Array.isArray(p) &&
          typeof p.emailReceiptId === "string"
            ? [p.emailReceiptId]
            : [],
        ),
      ),
    );
    const selectedIds = new Set(selected.map((l) => l.id));
    const lastSuccessfulIngestion = receipts
      .filter(
        (r) =>
          !!r.seenViaGmailAt &&
          r.status === "IMPORTED" &&
          (receiptIds.has(r.id) ||
            (Array.isArray(r.proposals) &&
              r.proposals.some(
                (p) =>
                  p &&
                  typeof p === "object" &&
                  !Array.isArray(p) &&
                  typeof p.listingId === "string" &&
                  selectedIds.has(p.listingId),
              ))),
      )
      .reduce<Date | null>(
        (last, r) =>
          r.seenViaGmailAt && (!last || r.seenViaGmailAt > last)
            ? r.seenViaGmailAt
            : last,
        null,
      );
    const drops = profile.trackPriceDrops ? selected.filter(hasPriceDrop) : [];
    const recentDrops = profile.trackPriceDrops
      ? selected
          .flatMap((l) =>
            recentPriceDrops(l.id, l.prices, now).map((event) => ({
              ...event,
              title: l.title,
              sourceUrl: l.sourceUrl,
            })),
          )
          .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
      : [];
    const intake = intakeFunnel(profile, listings, receipts, reviews);
    const insufficient = selected.filter(
      (l) => comparableStatus(l, now) === "INSUFFICIENT",
    ).length;
    const analysisPending = selected.filter((l) =>
      ["NOT_ANALYZED", "OUTDATED"].includes(comparableStatus(l, now)),
    ).length;
    const missingData = selected.filter(
      (l) => missingListingFields(l).length > 0,
    ).length;
    const reasons = [
      ...(!intake.gmailNotifications
        ? [
            "Bu pilot için Gmail bildirimi yok. Pilot etiket/gönderici eşlemesini ve bağlantı iznini kontrol edin.",
          ]
        : []),
      ...(intake.unparsedNotifications
        ? [
            `${intake.unparsedNotifications} bildirimin içindeki ilanlar ayrıştırılamadı; gerçek .eml örneğini inceleyin.`,
          ]
        : []),
      ...(intake.pendingListings
        ? [
            `${intake.pendingListings} ilan şablon, eksik alan, kimlik veya gövde tipi incelemesi bekliyor.`,
          ]
        : []),
      ...(intake.savedReal && !selected.length
        ? ["Kaydedilen ilanlar mevcut pilot filtrelerini karşılamıyor."]
        : []),
      ...(missingData
        ? [`${missingData} eşleşen ilanda karşılaştırma verisi eksik.`]
        : []),
      ...(insufficient
        ? [
            `${insufficient} eşleşen ilan için en az 5 yeterli emsal bulunamadı.`,
          ]
        : []),
      ...(analysisPending
        ? [`${analysisPending} eşleşen ilan güncel analiz bekliyor.`]
        : []),
      ...(!opportunities.length &&
      selected.length &&
      !insufficient &&
      !analysisPending &&
      !missingData
        ? ["Yeterli emsalli ilanlar minimum fırsat puanını karşılamıyor."]
        : []),
    ];
    return {
      id: profile.id,
      pilotKey: profile.pilotKey,
      name: profile.name,
      profile,
      funnel: {
        ...intake,
        matchedListings: selected.length,
        insufficientListings: insufficient,
        supportedOpportunities: opportunities.length,
        analysisPending,
        missingData,
      },
      zeroReasons: reasons,
      unassignedGmail: receipts.filter(
        (m) =>
          m.seenViaGmailAt &&
          !profiles.some((p) => attributedReceipt(m, p, listings)),
      ).length,
      recentDrops,
      recentDropCount: recentDrops.length,
      totalReal: selected.length,
      discoveredToday: selected.filter(
        (l) => l.createdAt >= istanbulDayStart(now) && l.createdAt <= now,
      ).length,
      priceDrops: drops.length,
      opportunities: opportunities.length,
      top: opportunities.slice(0, 5),
      reduced: drops.slice(0, 5),
      lastSuccessfulIngestion,
    };
  });
}
