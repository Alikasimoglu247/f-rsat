import { afterAll, beforeEach, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { ensureSources } from "../../src/lib/providers/registry";
import { ensurePilotProfiles } from "../../src/lib/pilots";
import {
  importRecords,
  listingInclude,
  analyzeAll,
} from "../../src/lib/listings";
import { research } from "../../src/lib/investment";
import { researchListingInput } from "../../src/lib/research-import";
import { investmentReport } from "../../src/lib/investment-report";
import { listingSchema } from "../../src/lib/validation";

const now = new Date("2026-10-09T21:05:00Z");
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Listing", "ListingSource", "ImportJob", "AnalysisRun", "AppSettings", "SearchProfile", "EmailMessage", "EmailTemplate", "MailboxConnection", "OAuthAttempt" CASCADE',
  );
  await ensureSources(db);
  await ensurePilotProfiles(db);
});
afterAll(() => db.$disconnect());

it("kaynak fiyatlarını PostgreSQL'e bir kez kaydeder; fiyatı olmayan projeyi ve demoları gerçek ilan saymaz", async () => {
  const candidate = research.candidates.find((item) => item.id === "genc-300")!;
  const input = researchListingInput(candidate, now)!;
  const first = await importRecords([input], "json", "PUBLIC_RESEARCH", {
    observedAt: new Date(candidate.observedAt),
  });
  const second = await importRecords([input], "json", "PUBLIC_RESEARCH", {
    observedAt: new Date(candidate.observedAt),
  });
  expect(first.inserted).toBe(1);
  expect(second.duplicates).toBe(1);
  const saved = await db.listing.findUniqueOrThrow({
    where: { id: first.ids[0] },
    include: listingInclude,
  });
  expect(saved.prices).toHaveLength(1);
  expect(saved.price.toFixed(2)).toBe("440000.00");
  expect(saved.land?.sizeM2?.toFixed(2)).toBe("300.00");
  await importRecords(
    [
      {
        ...input,
        externalId: "synthetic-demo",
        sourceUrl: "https://example.com/demo",
        isDemo: true,
      },
    ],
    "demo",
    "TEST",
  );
  const report = await investmentReport(now);
  const silivri = report.pilots[0];
  expect(silivri).toMatchObject({
    databaseCount: 1,
    researchCount: 5,
    analyzedCount: 5,
    pricedCount: 4,
    comparableSupported: 0,
    reviewCount: 0,
  });
  expect(
    silivri.decisions.filter((item) => item.sourceUrl === candidate.sourceUrl),
  ).toHaveLength(1);
  expect(
    silivri.decisions.find((item) => item.sourceUrl === candidate.sourceUrl),
  ).toMatchObject({
    origin: "DATABASE",
    unitPrice: "1466.67",
    verdict: "Yetersiz veri",
  });
  expect(
    silivri.decisions.some((item) => item.title.includes("synthetic-demo")),
  ).toBe(false);
});

it("araştırma adayları da mevcut kullanıcı kategori/ilçe/bütçe filtrelerine uyar", async () => {
  await db.searchProfile.update({
    where: { pilotKey: "SILIVRI" },
    data: { categories: ["TARLA"], maxPrice: "500000" },
  });
  const filtered = (await investmentReport(now)).pilots[0];
  expect(filtered.decisions).toHaveLength(1);
  expect(filtered.decisions[0]).toMatchObject({
    category: "TARLA",
    price: "425000",
    verdict: "Riskli",
  });
  await db.searchProfile.update({
    where: { pilotKey: "SILIVRI" },
    data: { district: "Çatalca" },
  });
  expect((await investmentReport(now)).pilots[0].decisions).toHaveLength(0);
});

it("Marmara SUV aynı karar mimarisini gerçek gövde kanıtlı kayda uygular; sedan dahil olmaz", async () => {
  const car = listingSchema.parse({
    title: "Sentetik entegrasyon aracı",
    category: "ARABA",
    province: "Bursa",
    district: "Nilüfer",
    price: "1000000",
    externalId: "suv",
    sourceUrl: "https://example.com/suv",
    bodyType: "SUV",
    bodyTypeVerified: true,
    bodyTypeEvidence: "Sentetik kaynak alanı",
    make: "Toyota",
    model: "RAV4",
    fuel: "Hibrit",
  });
  await importRecords(
    [
      car,
      {
        ...car,
        externalId: "sedan",
        sourceUrl: "https://example.com/sedan",
        bodyType: "SEDAN",
      },
    ],
    "json",
    "TEST",
    { observedAt: now },
  );
  const suv = (await investmentReport(now)).pilots[1];
  expect(suv.databaseCount).toBe(1);
  expect(suv.decisions[0]).toMatchObject({
    verdict: "Yetersiz veri",
    origin: "DATABASE",
  });
  expect(
    suv.decisions[0].missing.some((item) => item.includes("Araç özellikleri")),
  ).toBe(true);
});

it("dört fiyatlı kaynak adayı eski motorla analiz edilir; imar/hisse/tür farklarıyla ortak puan üretilmez", async () => {
  const records = research.candidates
    .map((candidate) => researchListingInput(candidate, now))
    .filter((record) => record != null);
  await importRecords(records, "json", "PUBLIC_RESEARCH", { observedAt: now });
  await db.$transaction((tx) => analyzeAll(tx));
  const report = await investmentReport(now);
  expect(report.pilots[0]).toMatchObject({
    databaseCount: 4,
    analyzedCount: 5,
    reviewCount: 0,
    comparableSupported: 0,
  });
  const assessments = await db.opportunityAssessment.findMany();
  expect(assessments).toHaveLength(4);
  expect(
    assessments.every((item) => item.score == null && item.sampleCount === 0),
  ).toBe(true);
  expect(
    report.pilots[0].decisions.filter((item) => item.verdict === "Riskli"),
  ).toHaveLength(2);
});
