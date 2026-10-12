import { beforeEach, afterAll, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { importRecords, analyzeAll } from "../../src/lib/listings";
import { ensureSources } from "../../src/lib/providers/registry";
import { ensurePilotProfiles } from "../../src/lib/pilots";
import { investmentReport } from "../../src/lib/investment-report";
import { dataQuality } from "../../src/lib/data-quality";
import { confirmTestRows } from "../helpers/quality";
import { parseAuthorizedFeed } from "../../src/lib/research/authorized-feed";
import { runResearch } from "../../src/lib/research/loop";
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "ResearchTask", "ResearchRun", "ResearchResource", "Listing", "ListingSource", "SearchProfile" CASCADE',
  );
  await ensureSources(db);
  await ensurePilotProfiles(db);
});
afterAll(() => db.$disconnect());
const input = {
  title: "SENTETİK 2024 tarihli arsa",
  category: "ARSA" as const,
  province: "İstanbul" as const,
  district: "Silivri",
  neighborhood: "Alibey",
  transactionType: "SATILIK",
  price: "440000",
  sourceUrl: "https://test.example/old-listing",
  externalId: "old-2024",
  isDemo: false,
  sizeM2: "300",
};
it("bugün okunan 2024 ilanı arşiv kalır; özgün fiyat geçmişi ve kimlik korunur", async () => {
  const old = new Date("2026-10-01T08:00:00Z"),
    today = new Date();
  await importRecords([input], "manual", "TEST", {
    observedAt: old,
    quality: { publishedAt: "2024-10-18", pageCheckedAt: old },
  });
  const before = await db.listing.findFirstOrThrow({
    include: { prices: true },
  });
  await importRecords([input], "manual", "TEST", {
    observedAt: today,
    quality: { publishedAt: "2024-10-18", pageCheckedAt: today },
  });
  await db.$transaction((tx) => analyzeAll(tx));
  const after = await db.listing.findFirstOrThrow({
    include: { prices: true, assessment: true },
  });
  expect(after.id).toBe(before.id);
  expect(after.prices).toEqual(before.prices);
  expect(after.priceVerifiedAt).toBeNull();
  expect(after.availabilityVerifiedAt).toBeNull();
  expect(dataQuality(after)).toMatchObject({
    status: "HISTORICAL",
    eligible: false,
  });
  expect(after.assessment?.score).toBeNull();
  const report = await investmentReport();
  expect(report.pilots[0].activeCount).toBe(0);
  expect(report.pilots[0].decisions[0].priceCurrent).toBe(false);
});
it("yakın tarihli ama teyitsiz altı benzer kayıt fiyat avantajı oluşturamaz", async () => {
  for (let i = 0; i < 6; i++)
    await importRecords(
      [
        {
          ...input,
          externalId: `test-${i}`,
          sourceUrl: `https://test.example/${i}`,
          price: String(440000 + i * 1000),
        },
      ],
      "manual",
      "TEST",
      { quality: { publishedAt: new Date(), pageCheckedAt: new Date() } },
    );
  await db.$transaction((tx) => analyzeAll(tx));
  expect(
    await db.opportunityAssessment.count({ where: { score: { not: null } } }),
  ).toBe(0);
  expect(await db.comparableListing.count()).toBe(0);
});
it("iki ayrı teyit güncel fiyatı etkinleştirir; fiyat değişince eski teyit geçerli kalmaz", async () => {
  await importRecords([input], "manual", "TEST");
  await confirmTestRows({ externalId: input.externalId });
  expect(dataQuality(await db.listing.findFirstOrThrow()).eligible).toBe(true);
  await importRecords([{ ...input, price: "400000" }], "manual", "TEST");
  const row = await db.listing.findFirstOrThrow({ include: { prices: true } });
  expect(dataQuality(row).eligible).toBe(false);
  expect(row.prices).toHaveLength(2);
});
it("izinli feed sözleşmesi DB/analiz hattında tarihleri korur ve tekrarda fiyat gözlemi çoğaltmaz", async () => {
  const at = new Date(),
    stamp = at.toISOString();
  const feed = {
    format: "firsatradar-authorized-listings",
    version: 1,
    source: {
      id: "synthetic-office",
      name: "SENTETİK entegrasyon testi",
      documentationUrl: "https://test.example/contract",
      grantReference: "synthetic-grant",
      allowStorage: true,
      allowComparison: true,
      allowReuse: true,
    },
    records: [
      {
        kind: "LISTING",
        listing: {
          ...input,
          title: "SENTETİK yetkili 2+1 daire",
          category: "EV",
          rooms: "2+1",
          propertyType: "Daire",
          netM2: "100",
          grossM2: "120",
        },
        publishedAt: "2026-10-10",
        sourceUpdatedAt: null,
        observedAt: stamp,
        priceVerifiedAt: stamp,
        availabilityStatus: "ACTIVE",
        availabilityVerifiedAt: stamp,
      },
    ],
  };
  const acquire = async () =>
    parseAuthorizedFeed(
      feed,
      { sourceId: "synthetic-office", reference: "synthetic-grant" },
      { segmentId: "CENTRAL_HOME" },
    );
  const first = await runResearch({
    acquire,
    now: at,
    segmentId: "CENTRAL_HOME",
  });
  expect(first.summary?.inserted).toBe(1);
  const row = await db.listing.findFirstOrThrow({
    include: { source: true, prices: true },
  });
  expect(row.source.method).toBe("LICENSED_FEED");
  expect(row.priceVerifiedAt?.toISOString()).toBe(stamp);
  expect(dataQuality(row, at).eligible).toBe(true);
  await runResearch({
    acquire,
    now: new Date(at.getTime() + 60_000),
    segmentId: "CENTRAL_HOME",
  });
  expect(await db.listing.count()).toBe(1);
  expect(await db.listingPriceHistory.count()).toBe(1);
  expect(
    (await db.listing.findFirstOrThrow()).priceVerifiedAt?.toISOString(),
  ).toBe(stamp);
  expect((await investmentReport(at)).pilots[0].comparableSupported).toBe(0);
});
