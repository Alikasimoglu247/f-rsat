import { beforeEach, afterAll, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { db } from "../../src/lib/db";
import { ensureSources } from "../../src/lib/providers/registry";
import { ingestEml, approveMessage } from "../../src/lib/email/ingestion";
import { sourceCoverage } from "../../src/lib/email/coverage";
import { importRecords } from "../../src/lib/listings";
import { demoListings } from "../../prisma/demo";
import { runDaily } from "../../src/lib/jobs";
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Listing", "ListingSource", "ImportJob", "AnalysisRun", "AppSettings", "SearchProfile", "EmailMessage", "EmailTemplate", "MailboxConnection", "OAuthAttempt" CASCADE',
  );
  await ensureSources(db);
});
afterAll(() => db.$disconnect());
it("kapsama paneli gerçek/demo sayısını ve işlenemeyen/eksik bildirimleri ayırır", async () => {
  await importRecords(demoListings(), "demo", "SEED");
  const raw = (
    await readFile("tests/fixtures/emails/sahibinden-synthetic.eml")
  ).toString();
  const first = await ingestEml(Buffer.from(raw));
  await approveMessage(first.message.id);
  await ingestEml(
    Buffer.from(
      raw
        .replace("Konum: İstanbul / Kadıköy", "")
        .replace("1234567890", "1234567891"),
    ),
  );
  const result = await sourceCoverage();
  expect(result.summary).toMatchObject({ real: 1, demo: 36, unprocessed: 1 });
  const source = result.sources.find((s) => s.id === "sahibinden-email")!;
  expect(source.realCount).toBe(1);
  expect(source.actualRegions).toEqual(["İstanbul"]);
  expect(source.actualCategories).toEqual(["EV"]);
  expect(source.pendingMessages).toBe(1);
  expect(source.accessStatus).toBe("USER_APPROVED");
  expect(source.missingFields).toEqual(
    expect.arrayContaining(["province", "district"]),
  );
});
it("09.00 motoru yeterli gerçek emsalleri rapora alır; demo ve yetersiz kanıtlı ilanı dışlar", async () => {
  await importRecords(demoListings(), "demo", "SEED");
  const raw = (
    await readFile("tests/fixtures/emails/sahibinden-synthetic.eml")
  ).toString();
  const first = await ingestEml(
    Buffer.from(raw.replace("4.250.000,50 TL", "3.000.000 TL")),
  );
  await approveMessage(first.message.id);
  for (let i = 1; i < 9; i++)
    await ingestEml(
      Buffer.from(
        raw
          .replace("1234567890", String(1234567890 + i))
          .replace(
            "Sentetik test Kadıköy dairesi",
            `Sentetik test emsal daire ${i}`,
          ),
      ),
    );
  await importRecords(
    [
      {
        title: "Yetersiz gerçek araç test kaydı",
        category: "ARABA",
        province: "Bursa",
        district: "Nilüfer",
        price: "1000000",
        isDemo: false,
        externalId: "insufficient",
      },
    ],
    "manual",
    "MANUAL",
  );
  const result = await runDaily({ key: "m2-real-report", providers: [] });
  expect(result.status).toBe("COMPLETED");
  const report = await db.dailyReport.findUniqueOrThrow({
    where: { runId: "m2-real-report" },
  });
  expect(report.listingIds.length).toBeGreaterThan(0);
  expect(report.body).toContain("3.000.000");
  expect(report.body).toContain("sahibinden.com");
  expect(report.body).not.toContain("[DEMO]");
  expect(report.body).not.toContain("Yetersiz gerçek araç");
  const listings = await db.listing.findMany({
    where: { id: { in: report.listingIds } },
    include: { assessment: true },
  });
  expect(
    listings.every(
      (l) =>
        !l.isDemo &&
        l.assessment?.score !== null &&
        l.assessment?.confidence !== "INSUFFICIENT",
    ),
  ).toBe(true);
  expect(
    (await runDaily({ key: "m2-real-report", providers: [] })).status,
  ).toBe("ALREADY_COMPLETED");
  expect(await db.dailyReport.count()).toBe(1);
});
