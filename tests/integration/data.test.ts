import { beforeEach, afterAll, it, expect } from "vitest";
import { db } from "../../src/lib/db";
import { ensureSources } from "../../src/lib/providers/registry";
import { importRecords, listingInclude } from "../../src/lib/listings";
import { listingSchema } from "../../src/lib/validation";
import { runDaily } from "../../src/lib/jobs";
import { demoListings } from "../../prisma/demo";
import { browseListings } from "../../src/lib/queries";
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Listing", "ListingSource", "ImportJob", "AnalysisRun", "AppSettings", "SearchProfile" CASCADE',
  );
  await ensureSources(db);
});
afterAll(() => db.$disconnect());
const input = () =>
  listingSchema.parse({
    title: "Entegrasyon test dairesi",
    category: "EV",
    province: "İstanbul",
    district: "Kadıköy",
    price: "1250000.50",
    sourceUrl: "https://example.com/listing/42",
  });
it("decimal fiyatı korur; mükerrer dosya ve değişen fiyat geçmişini doğru işler", async () => {
  const original = await importRecords([input()], "csv", "CSV");
  expect(original.inserted).toBe(1);
  const repeated = await importRecords([input()], "json", "JSON");
  expect(repeated.duplicates).toBe(1);
  const changed = await importRecords(
    [{ ...input(), price: "1100000.25" }],
    "csv",
    "CSV",
  );
  expect(changed.updated).toBe(1);
  const listing = await db.listing.findUniqueOrThrow({
    where: { id: original.ids[0] },
    include: listingInclude,
  });
  expect(listing.price.toFixed(2)).toBe("1100000.25");
  expect(listing.prices).toHaveLength(2);
  expect(listing.prices[0].price.toFixed(2)).toBe("1250000.50");
  expect(listing.sourceId).toBe("csv");
  expect(listing.provenance).toHaveProperty("importJobId");
});
it("tüm dosyayı tek işlemde saklar; kimlik çakışmasında kısmi veri kalmaz", async () => {
  await importRecords([input()], "manual", "MANUAL");
  await expect(
    importRecords(
      [
        {
          ...input(),
          title: "Yeni farklı ilan",
          sourceUrl: "https://example.com/new",
          externalId: "new",
        },
        { ...input(), category: "ARABA" },
      ],
      "csv",
      "CSV",
    ),
  ).rejects.toThrow();
  expect(await db.listing.count()).toBe(1);
  expect(await db.importJob.count({ where: { status: "FAILED" } })).toBe(1);
});
it("eşzamanlı aynı dosya tek kayıt ve tek fiyat gözlemi oluşturur", async () => {
  await Promise.all([
    importRecords([input()], "csv", "CSV"),
    importRecords([input()], "csv", "CSV"),
  ]);
  expect(await db.listing.count()).toBe(1);
  expect(await db.listingPriceHistory.count()).toBe(1);
});
it("dört kategoriyi ve il/ilçe/bütçe filtrelerini gerçek DB üzerinde uygular", async () => {
  await importRecords(demoListings(), "demo", "SEED");
  for (const category of ["EV", "ARABA", "ARSA", "TARLA"])
    expect((await browseListings({ category })).total).toBe(9);
  const result = await browseListings({
    province: "İstanbul",
    district: "Kadıköy",
    maxPrice: "4500000",
    demo: "demo",
  });
  expect(result.total).toBe(1);
});
it("günlük iş idempotenttir; bildirimleri ve emsalleri tekrar üretmez", async () => {
  await importRecords(demoListings(), "demo", "SEED");
  await db.appSettings.update({
    where: { id: "personal" },
    data: { includeDemoNotifications: true, minScore: 0 },
  });
  for (const name of ["Kural A", "Kural B"])
    await db.searchProfile.create({
      data: { name, alerts: { create: { minScore: 0 } } },
    });
  const result = await runDaily({ key: "integration-day", providers: [] });
  expect(result.processed).toBe(36);
  const notifications = await db.notification.count();
  expect(notifications).toBe(36);
  expect(
    (await runDaily({ key: "integration-day", providers: [] })).status,
  ).toBe("ALREADY_COMPLETED");
  expect(await db.notification.count()).toBe(notifications);
  const first = await db.listing.findFirstOrThrow({
    where: { externalId: "demo-ev-0" },
    include: { assessment: true },
  });
  expect(first.assessment?.score).toBeGreaterThan(70);
  expect(first.assessment?.sampleCount).toBe(8);
});
it("bir kaynak hatası diğer kaynakları ve analizi durdurmaz", async () => {
  await importRecords([input()], "manual", "MANUAL");
  let attempts = 0;
  const result = await runDaily({
    key: "partial-day",
    providers: [
      {
        sourceId: "licensed-feed",
        authorized: () => true,
        collect: async () => {
          attempts++;
          throw new Error("denied");
        },
      },
      {
        sourceId: "json",
        authorized: () => true,
        collect: async () => [
          {
            ...input(),
            title: "Başarılı diğer kaynak",
            sourceUrl: "https://example.com/success",
          },
        ],
      },
    ],
  });
  expect(result.status).toBe("PARTIAL");
  expect(attempts).toBe(3);
  expect(await db.listing.count()).toBe(2);
  expect(await db.sourceSyncLog.count({ where: { status: "FAILED" } })).toBe(1);
  expect(await db.sourceSyncLog.count({ where: { status: "SUCCESS" } })).toBe(
    1,
  );
  expect(
    (
      await db.listingSource.findUniqueOrThrow({
        where: { id: "licensed-feed" },
      })
    ).accessStatus,
  ).toBe("ERROR");
});
it("takip listesi veritabanında kalır; demo bildirimleri varsayılan kapalıdır", async () => {
  const result = await importRecords(demoListings(), "demo", "SEED");
  await db.watchlist.create({ data: { listingId: result.ids[0] } });
  expect((await browseListings({ watch: "true" })).total).toBe(1);
  await runDaily({ key: "no-demo-alerts", providers: [] });
  expect(await db.notification.count()).toBe(0);
});
