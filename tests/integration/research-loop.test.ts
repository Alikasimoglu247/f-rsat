import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { runResearch } from "../../src/lib/research/loop";
import { research, sourceFresh } from "../../src/lib/investment";
import type { AcquisitionResult } from "../../src/lib/research/types";
import { ensureSources } from "../../src/lib/providers/registry";
import { ensurePilotProfiles } from "../../src/lib/pilots";
import { investmentReport } from "../../src/lib/investment-report";

const clock = new Date("2026-10-09T21:05:00Z");
const url = "https://www.genccity.com/satilik-arsa/synthetic-test/099099099099";
function fixture(
  price = "440000",
  risk = true,
  rate = 37,
  when = clock,
): AcquisitionResult {
  const observedAt = when.toISOString();
  const source = {
    ...research.sources.find((item) => item.id === "genc-300")!,
    id: "synthetic-listing",
    url,
    retrievedAt: observedAt,
    checkStatus: "VALID",
  };
  const policy = {
    ...research.sources.find((item) => item.id === "policy")!,
    id: "synthetic-policy",
    url: "https://www.tcmb.gov.tr/synthetic-test",
    retrievedAt: observedAt,
    kind: "OFFICIAL",
    checkStatus: "VALID",
  };
  const candidate = {
    ...research.candidates.find((item) => item.id === "genc-300")!,
    id: "synthetic-candidate",
    sourceId: source.id,
    sourceUrl: url,
    externalId: "synthetic-test",
    title: "SENTETİK test adayı; canlı ilan değildir",
    price,
    observedAt,
    factIds: ["synthetic-claim"],
    riskSignals: risk ? ["SENTETİK çelişkili hisse beyanı"] : [],
  };
  return {
    sources: [source, policy],
    facts: [
      {
        id: "synthetic-claim",
        sourceId: source.id,
        label: "SENTETİK yayıncı beyanı",
        value: null,
        unit: "",
        period: "2026-10",
        scope: "Test",
      },
      {
        id: "policy-rate",
        sourceId: policy.id,
        label: "SENTETİK politika testi",
        value: rate,
        unit: "%",
        period: "2026-10",
        scope: "Test",
      },
    ],
    candidates: [candidate],
    discoveries: [
      {
        url,
        kind: "LISTING",
        discoveredFrom: "https://www.genccity.com/",
        status: "ALLOWED",
      },
    ],
    checks: [
      {
        url,
        status: "PARSED",
        checkedAt: observedAt,
        sha256: source.sha256,
        httpStatus: 200,
      },
      {
        url: policy.url,
        status: "PARSED",
        checkedAt: observedAt,
        sha256: policy.sha256,
        httpStatus: 200,
      },
    ],
  };
}
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "ResearchRun", "ResearchResource", "Listing", "ListingSource", "ImportJob", "AnalysisRun", "AppSettings", "SearchProfile" CASCADE',
  );
  await ensureSources(db);
  await ensurePilotProfiles(db);
});
afterEach(async () => {
  await db.researchRun.deleteMany();
  await db.researchResource.deleteMany();
});
afterAll(() => db.$disconnect());

it("aynı ada/parsel beyanlı farklı kaynak URL'lerini birleştirmez; belirsiz fiziksel mükerreri incelemeye alır", async () => {
  const acquired = fixture("440000", false);
  const secondUrl =
    "https://www.genccity.com/satilik-arsa/synthetic-test-repost/098098098098";
  const source = {
    ...acquired.sources[0],
    id: "synthetic-repost",
    url: secondUrl,
  };
  const candidate = {
    ...acquired.candidates[0],
    id: "synthetic-repost",
    sourceId: source.id,
    sourceUrl: secondUrl,
    externalId: "synthetic-repost",
    factIds: ["synthetic-repost-offer"],
  };
  acquired.sources.push(source);
  acquired.candidates.push(candidate);
  acquired.facts.push({
    ...acquired.facts[0],
    id: "synthetic-repost-offer",
    sourceId: source.id,
  });
  const result = await runResearch({
    now: clock,
    acquire: async () => acquired,
  });
  expect(result.summary).toMatchObject({
    inserted: 2,
    reviewed: 2,
    comparableSupported: 0,
  });
  expect(await db.listing.count({ where: { isDemo: false } })).toBe(2);
  expect(await db.listingPriceHistory.count()).toBe(2);
  expect(
    await db.listingReview.count({
      where: { kind: "POSSIBLE_SHARED_PARCEL", status: "PENDING" },
    }),
  ).toBe(1);
  const report = await investmentReport(clock);
  expect(
    report.pilots[0].decisions
      .filter((item) => [url, secondUrl].includes(item.sourceUrl ?? ""))
      .every(
        (item) => item.assessment == null && item.verdict === "Yetersiz veri",
      ),
  ).toBe(true);
});

it("ikinci çalışma kaynağı tekrar okur, fiyatı ve gerekçeyi değiştirir; aynı fiyat tekrarında olay üretmez", async () => {
  let calls = 0;
  const first = await runResearch({
    now: clock,
    acquire: async () => {
      calls++;
      return fixture();
    },
  });
  const nextClock = new Date(clock.getTime() + 60_000);
  const second = await runResearch({
    now: nextClock,
    acquire: async () => {
      calls++;
      return fixture("390000", false, 40, nextClock);
    },
  });
  const thirdClock = new Date(clock.getTime() + 120_000);
  const third = await runResearch({
    now: thirdClock,
    acquire: async () => {
      calls++;
      return fixture("390000", false, 40, thirdClock);
    },
  });
  expect(calls).toBe(3);
  expect(new Set([first.id, second.id, third.id]).size).toBe(3);
  expect(second.summary).toMatchObject({
    priceChanges: 1,
    factChanges: 1,
    inserted: 0,
    duplicates: 0,
    reviewCount: 0,
  });
  expect(second.summary!.decisionRevisions).toBeGreaterThanOrEqual(1);
  expect(third.summary).toMatchObject({
    priceChanges: 0,
    factChanges: 0,
    decisionRevisions: 0,
    duplicates: 1,
  });
  const saved = await db.listing.findFirstOrThrow({
    where: { sourceUrl: url },
    include: { prices: true },
  });
  expect(saved.price.toFixed(2)).toBe("390000.00");
  expect(saved.prices).toHaveLength(2);
  const run = await db.researchRun.findUniqueOrThrow({
    where: { id: second.id },
  });
  expect(run.changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "DECISION_REVISED",
        before: "Riskli",
        after: "Yetersiz veri",
      }),
    ]),
  );
  expect(JSON.stringify(run.decisions)).toContain("%40");
});

it("engellenen kanıtı derhal karar dışına çıkarır ve sonraki çalışmada engelli kaynak listesini taşır", async () => {
  await runResearch({ now: clock, acquire: async () => fixture() });
  const nextClock = new Date(clock.getTime() + 60_000);
  const blocked: AcquisitionResult = {
    sources: [],
    facts: [],
    candidates: [],
    discoveries: [],
    checks: [
      {
        url,
        status: "ACCESS_BLOCKED",
        checkedAt: nextClock.toISOString(),
        httpStatus: 403,
        reason: "SENTETİK erişim engeli",
      },
    ],
  };
  const failed = await runResearch({
    now: nextClock,
    acquire: async () => blocked,
  });
  expect(failed.status).toBe("FAILED");
  const report = await investmentReport(nextClock);
  const decision = report.pilots[0].decisions.find(
    (item) => item.sourceUrl === url,
  )!;
  expect(decision).toMatchObject({
    verdict: "Yetersiz veri",
    unitPrice: null,
    assessment: null,
    priceCurrent: false,
  });
  expect(
    report.sources
      .filter((source) => source.url === url)
      .every((source) => !sourceFresh(source, nextClock)),
  ).toBe(true);
  let transferred: string[] = [];
  await runResearch({
    now: new Date(clock.getTime() + 120_000),
    acquire: async (options) => {
      transferred = options?.blockedUrls ?? [];
      return blocked;
    },
  });
  expect(transferred).toContain(url);
  expect(await db.listingPriceHistory.count()).toBe(1);
});

it("eşzamanlı çalışan ajan ikinci kez veri toplamaz", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired!: () => void;
  const entered = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const first = runResearch({
    now: clock,
    acquire: async () => {
      acquired();
      await gate;
      return fixture();
    },
  });
  await entered;
  let secondAcquired = false;
  const second = await runResearch({
    now: clock,
    acquire: async () => {
      secondAcquired = true;
      return fixture();
    },
  });
  expect(second.status).toBe("RUNNING");
  expect(secondAcquired).toBe(false);
  release();
  await first;
});

it("fiyat kaybolduğunda önceki fiyatı yeni gözlem veya indirim saymaz", async () => {
  await runResearch({ now: clock, acquire: async () => fixture() });
  const nextClock = new Date(clock.getTime() + 60_000);
  const missing = fixture("440000", false, 37, nextClock);
  missing.candidates[0].price = null;
  const second = await runResearch({
    now: nextClock,
    acquire: async () => missing,
  });
  expect(second.summary).toMatchObject({
    priceChanges: 0,
    inserted: 0,
    updated: 0,
  });
  expect(await db.listingPriceHistory.count()).toBe(1);
  const report = await investmentReport(nextClock);
  expect(
    report.pilots[0].decisions.find((item) => item.sourceUrl === url),
  ).toMatchObject({
    assessment: null,
    priceCurrent: false,
    verdict: "Yetersiz veri",
  });
});

it("çelişen harici ID yeni fiyatı eski kayda bağlamaz; kimlik incelemesi fiyat olayına dönüşmez", async () => {
  await runResearch({ now: clock, acquire: async () => fixture() });
  const nextClock = new Date(clock.getTime() + 60_000);
  const conflicting = fixture("390000", false, 37, nextClock);
  conflicting.candidates[0].externalId = "synthetic-conflicting-id";
  const second = await runResearch({
    now: nextClock,
    acquire: async () => conflicting,
  });
  expect(second.summary).toMatchObject({
    reviewed: 1,
    priceChanges: 0,
    updated: 0,
  });
  expect(await db.listingPriceHistory.count()).toBe(1);
  const saved = await db.listing.findFirstOrThrow({
    where: { sourceUrl: url },
  });
  expect(saved.price.toFixed(2)).toBe("440000.00");
  const decision = (await investmentReport(nextClock)).pilots[0].decisions.find(
    (item) => item.sourceUrl === url,
  )!;
  expect(decision).toMatchObject({
    assessment: null,
    priceCurrent: false,
    verdict: "Yetersiz veri",
  });
  expect(decision.missing.join(" ")).toMatch(/kimli|uzlaştır/iu);
});
