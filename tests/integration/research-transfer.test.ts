import { afterAll, beforeEach, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import {
  exportResearchBundle,
  importResearchBundle,
  validateBundle,
} from "../../src/lib/research/transfer";
import { importRecords } from "../../src/lib/listings";
import { investmentReport } from "../../src/lib/investment-report";
import { ensurePilotProfiles } from "../../src/lib/pilots";
import { claimResearchTask } from "../../src/lib/research/control";

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "ResearchTask", "ResearchRun", "ResearchResource", "Listing", "ListingSource", "SearchProfile" CASCADE',
  );
  await ensurePilotProfiles(db);
});
afterAll(() => db.$disconnect());
async function publicFixture() {
  await db.listingSource.create({
    data: {
      id: "transfer-synthetic",
      name: "SENTETİK aktarım testi",
      method: "PUBLIC_RESEARCH",
      authorization: "Sentetik test kaynağı",
      categories: ["ARSA"],
      regions: ["İstanbul / Silivri"],
    },
  });
  await importRecords(
    [
      {
        title: "SENTETİK 300 m² arsa",
        category: "ARSA",
        province: "İstanbul",
        district: "Silivri",
        neighborhood: "Değirmenköy",
        transactionType: "Satılık",
        price: "440000.00",
        externalId: "fixture-transfer",
        sourceUrl: "https://www.genccity.com/synthetic-transfer",
        isDemo: false,
        sizeM2: "300",
      },
    ],
    "transfer-synthetic",
    "TEST",
    { observedAt: new Date("2026-10-01T08:00:00Z") },
  );
  return exportResearchBundle();
}
it("önizleme yazmaz; uygulama tarihleri korur ve ikinci aktarım fiyat/ilanı çoğaltmaz", async () => {
  const bundle = await publicFixture();
  const original = bundle.tables.ListingPriceHistory[0].observedAt;
  await db.listing.deleteMany();
  const preview = await importResearchBundle(bundle);
  expect(preview).toMatchObject({
    inserted: 1,
    pricesAdded: 1,
    applied: false,
  });
  expect(await db.listing.count()).toBe(0);
  expect(await importResearchBundle(bundle, true)).toMatchObject({
    inserted: 1,
    pricesAdded: 1,
  });
  expect(await importResearchBundle(bundle, true)).toMatchObject({
    inserted: 0,
    matched: 1,
    pricesAdded: 0,
  });
  expect(
    (await db.listingPriceHistory.findFirstOrThrow()).observedAt.toISOString(),
  ).toBe(original);
});
it("yerel gerçek kayıtları ve düzenlenmiş profilleri korur; demo dışarı çıkarılmaz", async () => {
  const bundle = await publicFixture();
  await db.searchProfile.updateMany({
    where: { pilotKey: "SILIVRI" },
    data: { maxPrice: "1234567" },
  });
  await db.listingSource.create({
    data: {
      id: "local-user",
      name: "Yerel",
      method: "MANUAL",
      authorization: "USER",
      categories: ["ARSA"],
    },
  });
  await importRecords(
    [
      {
        title: "Yerel korunacak",
        category: "ARSA",
        province: "İstanbul",
        district: "Silivri",
        price: "900000",
        externalId: "local",
        isDemo: false,
      },
    ],
    "local-user",
    "TEST",
  );
  await importRecords(
    [
      {
        title: "[DEMO] Korunacak",
        category: "ARSA",
        province: "İstanbul",
        district: "Silivri",
        price: "100000",
        externalId: "demo-transfer",
        isDemo: true,
      },
    ],
    "transfer-synthetic",
    "TEST",
  );
  expect((await exportResearchBundle()).tables.Listing).toHaveLength(1);
  await importResearchBundle(bundle, true);
  expect(await db.listing.count()).toBe(3);
  expect(
    (
      await db.searchProfile.findUniqueOrThrow({
        where: { pilotKey: "SILIVRI" },
      })
    ).maxPrice?.toString(),
  ).toBe("1234567");
});
it("değiştirilmiş paket bütünlüğünü reddeder", async () => {
  const bundle = await publicFixture();
  bundle.tables.Listing[0].price = "1";
  expect(() => validateBundle(bundle)).toThrow("bütünlük");
  expect(await db.listing.count()).toBe(1);
});
it("kamusal araştırma dışa aktarımı notlardaki kişisel bilgileri ve gömülü sırları temizler", async () => {
  await publicFixture();
  await db.listing.updateMany({
    data: {
      provenance: {
        email: "private@example.com",
        token: "do-not-export-this",
        notes:
          "İletişim: private@example.com / 0532 123 45 67; Bearer synthetic-secret; postgresql://user:private-pass@host/db; api_key=synthetic-key",
      },
    },
  });
  const text = JSON.stringify(await exportResearchBundle());
  for (const value of [
    "private@example.com",
    "0532",
    "do-not-export-this",
    "synthetic-secret",
    "private-pass",
    "synthetic-key",
  ])
    expect(text).not.toContain(value);
});
it("boş DB eski JSON'u aktif ilan veya başarılı araştırma saymaz", async () => {
  const report = await investmentReport();
  expect(report.pilots[0].decisions).toHaveLength(0);
  expect(report.pilots[0].archive.length).toBeGreaterThan(0);
  expect(report.pilots[0].activeCount).toBe(0);
  expect(report.sources.every((s) => !s.fresh)).toBe(true);
  expect(report.researchLoop.mode).toBe("LEGACY_ARCHIVE");
});
it("UI işlemleri eşzamanlı ve hızlı tekrar isteklerini DB kilidiyle reddeder", async () => {
  const results = await Promise.allSettled([
    claimResearchTask("RESEARCH"),
    claimResearchTask("RESEARCH"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.researchTask.count()).toBe(1);
  await db.researchTask.updateMany({ data: { status: "COMPLETED" } });
  await expect(claimResearchTask("REEVALUATE")).rejects.toThrow("bir dakika");
});
it("araştırma sürerken aktarımı engeller", async () => {
  const bundle = await publicFixture();
  await db.researchRun.create({
    data: {
      trigger: "MANUAL",
      segment: "TEST",
      status: "RUNNING",
      summary: {},
      snapshot: {},
      decisions: [],
      changes: [],
      checks: [],
      discoveries: [],
    },
  });
  await expect(importResearchBundle(bundle, true)).rejects.toThrow("aktifken");
});
