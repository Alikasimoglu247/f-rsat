import { beforeEach, afterAll, it, expect } from "vitest";
import { db } from "../../src/lib/db";
import { ensureSources } from "../../src/lib/providers/registry";
import {
  ensurePilotProfiles,
  pilotSummaries,
  istanbulDayStart,
} from "../../src/lib/pilots";
import { importRecords, analyzeAll } from "../../src/lib/listings";
import { listingSchema } from "../../src/lib/validation";
import { verifyBodyType } from "../../src/lib/vehicle-review";
import { runDaily } from "../../src/lib/jobs";
import { demoListings } from "../../prisma/demo";
const home = (id: string, extra: Record<string, unknown> = {}) =>
  listingSchema.parse({
    title: `Sentetik Silivri konut ${id}`,
    category: "EV",
    province: "İstanbul",
    district: "Silivri",
    neighborhood: "Alibey",
    transactionType: "SATILIK",
    price: "4500000",
    externalId: id,
    propertyType: "Daire",
    rooms: "2+1",
    buildingAge: 10,
    condition: "İyi",
    netM2: "100",
    grossM2: "125",
    ...extra,
  });
const vehicle = (id: string, extra: Record<string, unknown> = {}) =>
  listingSchema.parse({
    title: `Sentetik SUV başlığı ${id}`,
    category: "ARABA",
    province: "Bursa",
    district: "Nilüfer",
    price: "1000000",
    externalId: id,
    make: "Toyota",
    model: "RAV4",
    trim: "Dream",
    modelYear: 2022,
    mileage: 60000,
    fuel: "Hibrit",
    transmission: "Otomatik",
    damageHistory: "Beyan: kayıt yok",
    ...extra,
  });
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Listing", "ListingSource", "ImportJob", "AnalysisRun", "AppSettings", "SearchProfile", "EmailMessage", "EmailTemplate", "MailboxConnection", "OAuthAttempt" CASCADE',
  );
  await ensureSources(db);
  await ensurePilotProfiles(db);
});
afterAll(() => db.$disconnect());
it("varsayılan iki pilot sınırsız bütçelidir; tekrar kurulum kullanıcı filtrelerini ezmez", async () => {
  const profiles = await db.searchProfile.findMany({
    include: { alerts: true },
  });
  expect(profiles).toHaveLength(2);
  const silivri = profiles.find((p) => p.pilotKey === "SILIVRI")!;
  expect(silivri).toMatchObject({
    district: "Silivri",
    categories: ["EV", "ARSA", "TARLA"],
    transactionType: "SATILIK",
    minPrice: null,
    maxPrice: null,
    trackPriceDrops: true,
  });
  expect(silivri.alerts[0].minScore).toBe(70);
  expect(
    profiles.find((p) => p.pilotKey === "MARMARA_SUV")?.provinces,
  ).toHaveLength(11);
  await db.searchProfile.update({
    where: { id: silivri.id },
    data: { district: "Çatalca", categories: ["ARSA"], maxPrice: "1234567.89" },
  });
  await ensurePilotProfiles(db);
  expect(
    await db.searchProfile.findUnique({ where: { id: silivri.id } }),
  ).toMatchObject({
    district: "Çatalca",
    categories: ["ARSA"],
    maxPrice: expect.objectContaining({}),
  });
  expect(
    (
      await db.searchProfile.findUniqueOrThrow({ where: { id: silivri.id } })
    ).maxPrice?.toFixed(2),
  ).toBe("1234567.89");
});
it("pilot sayımı demo, kiralık, farklı ilçe ve işlem türü eksik kayıtları ayırır", async () => {
  await importRecords(
    [
      home("match"),
      home("rental", { transactionType: "KIRALIK" }),
      home("unknown", { transactionType: undefined }),
      home("elsewhere", { district: "Çatalca" }),
      home("demo", { isDemo: true }),
    ],
    "csv",
    "CSV",
  );
  const p = (await pilotSummaries(db)).find((p) => p.pilotKey === "SILIVRI")!;
  expect(p.totalReal).toBe(1);
  expect(p.top).toEqual([]);
  expect(p.lastSuccessfulIngestion).toBeNull();
});
it("SUV başlığından sınıflandırmaz; kaynak kanıtı onayı sonrası dahil eder", async () => {
  const result = await importRecords(
    [vehicle("unknown", { bodyType: "SUV" })],
    "csv",
    "CSV",
  );
  expect(
    (await pilotSummaries(db)).find((p) => p.pilotKey === "MARMARA_SUV")
      ?.totalReal,
  ).toBe(0);
  expect(
    await db.listingReview.count({
      where: { kind: "VEHICLE_BODY_TYPE", status: "PENDING" },
    }),
  ).toBe(1);
  await verifyBodyType(result.ids[0], {
    bodyType: "SUV",
    bodyTypeEvidence: "İncelenen test kaynak belgesi",
    evidenceReviewed: true,
  });
  expect(
    (await pilotSummaries(db)).find((p) => p.pilotKey === "MARMARA_SUV")
      ?.totalReal,
  ).toBe(1);
  expect(
    await db.listingReview.count({
      where: { kind: "VEHICLE_BODY_TYPE", status: "PENDING" },
    }),
  ).toBe(0);
  await importRecords(
    [vehicle("unknown", { bodyType: "CROSSOVER" })],
    "csv",
    "CSV",
  );
  expect(
    (await pilotSummaries(db)).find((p) => p.pilotKey === "MARMARA_SUV")
      ?.totalReal,
  ).toBe(0);
  expect(
    await db.listingReview.count({
      where: { kind: "VEHICLE_BODY_TYPE", status: "PENDING" },
    }),
  ).toBe(1);
});
it("SUV/Crossover gövde tipi ve yakıt kapsamını uygular; kanıtsız verified girdisini reddeder", async () => {
  await expect(
    importRecords(
      [vehicle("bad", { bodyType: "SUV", bodyTypeVerified: true })],
      "csv",
      "CSV",
    ),
  ).rejects.toThrow("kanıt");
  await importRecords(
    [
      vehicle("ok", {
        bodyType: "CROSSOVER",
        bodyTypeVerified: true,
        bodyTypeEvidence: "İncelenen test teknik belgesi",
      }),
      vehicle("sedan", {
        bodyType: "SEDAN",
        bodyTypeVerified: true,
        bodyTypeEvidence: "İncelenen test teknik belgesi",
      }),
      vehicle("lpg", {
        fuel: "LPG",
        bodyType: "SUV",
        bodyTypeVerified: true,
        bodyTypeEvidence: "İncelenen test teknik belgesi",
      }),
    ],
    "csv",
    "CSV",
  );
  expect(
    (await pilotSummaries(db)).find((p) => p.pilotKey === "MARMARA_SUV")
      ?.totalReal,
  ).toBe(1);
});
it("İstanbul gün sınırında keşfi ve puansız fiyat düşüşünü ayrı sayar", async () => {
  const result = await importRecords([home("old"), home("new")], "csv", "CSV");
  const boundary = istanbulDayStart();
  await db.listing.update({
    where: { id: result.ids[0] },
    data: { createdAt: new Date(boundary.getTime() - 1) },
  });
  await importRecords([home("old", { price: "4000000" })], "csv", "CSV");
  const p = (await pilotSummaries(db)).find((p) => p.pilotKey === "SILIVRI")!;
  expect(p.discoveredToday).toBe(1);
  expect(p.priceDrops).toBe(1);
  expect(p.opportunities).toBe(0);
  expect(p.reduced[0].externalId).toBe("old");
});
it("gerçek emsalli ilk 5 pilot fırsatını sıralar; rapor canlı alım yokken başarı iddiası üretmez", async () => {
  await importRecords(demoListings(), "demo", "SEED");
  await importRecords(
    Array.from({ length: 14 }, (_, i) =>
      home(`real-${i}`, {
        price: i < 6 ? String(3000000 + i * 10000) : "4500000",
      }),
    ),
    "csv",
    "CSV",
  );
  await importRecords(
    [
      vehicle("insufficient", {
        bodyType: "SUV",
        bodyTypeVerified: true,
        bodyTypeEvidence: "İncelenen test teknik belgesi",
      }),
    ],
    "csv",
    "CSV",
  );
  await runDaily({ key: "m21-pilot-report", providers: [] });
  const pilots = await pilotSummaries(db),
    p = pilots.find((p) => p.pilotKey === "SILIVRI")!;
  expect(p.totalReal).toBe(14);
  expect(p.opportunities).toBe(6);
  expect(p.top).toHaveLength(5);
  expect(
    p.top.every(
      (l) =>
        !l.isDemo &&
        l.assessment!.sampleCount >= 5 &&
        l.assessment!.score! >= 70,
    ),
  ).toBe(true);
  expect(p.top[0].assessment!.score).toBeGreaterThanOrEqual(
    p.top[4].assessment!.score!,
  );
  const report = await db.dailyReport.findUniqueOrThrow({
    where: { runId: "m21-pilot-report" },
  });
  expect(report.body).toContain("Silivri Gayrimenkul Fırsatları");
  expect(report.body).toContain("Marmara SUV Fırsatları");
  expect(report.body).toContain("başarılı otomatik Gmail alımı doğrulanmadı");
  expect(report.body).not.toContain("[DEMO]");
  const insufficient = await db.listing.findFirstOrThrow({
    where: { externalId: "insufficient" },
  });
  expect(report.listingIds).not.toContain(insufficient.id);
});
it("yerel .eml/manuel alımı veya genel kaynak tarihi pilotun canlı Gmail alımı sayılmaz", async () => {
  const result = await importRecords(
    [home("receipt")],
    "sahibinden-email",
    "EML",
  );
  await db.listingSource.update({
    where: { id: "sahibinden-email" },
    data: { lastSuccessAt: new Date(), accessStatus: "CONNECTED" },
  });
  expect(
    (await pilotSummaries(db)).find((p) => p.pilotKey === "SILIVRI")
      ?.lastSuccessfulIngestion,
  ).toBeNull();
  const receipt = await db.emailMessage.create({
    data: {
      contentHash: "synthetic-live-receipt",
      transport: "GMAIL",
      sender: "test@example.test",
      subject: "Synthetic test only",
      status: "IMPORTED",
      proposals: [],
      errors: [],
      seenViaGmailAt: new Date(),
    },
  });
  await db.listing.update({
    where: { id: result.ids[0] },
    data: { provenance: { emailReceiptId: receipt.id } },
  });
  expect(
    (await pilotSummaries(db)).find((p) => p.pilotKey === "SILIVRI")
      ?.lastSuccessfulIngestion,
  ).toEqual(receipt.seenViaGmailAt);
  // An unchanged-price delivery still updates the last successful intake via its receipt.
  const newer = await db.emailMessage.create({
    data: {
      contentHash: "synthetic-later-delivery",
      transport: "GMAIL",
      sender: "test@example.test",
      subject: "Synthetic unchanged price",
      status: "IMPORTED",
      proposals: [{ listingId: result.ids[0] }],
      errors: [],
      seenViaGmailAt: new Date(Date.now() + 1000),
    },
  });
  expect(
    (await pilotSummaries(db)).find((p) => p.pilotKey === "SILIVRI")
      ?.lastSuccessfulIngestion,
  ).toEqual(newer.seenViaGmailAt);
  await db.$transaction((tx) => analyzeAll(tx));
});
