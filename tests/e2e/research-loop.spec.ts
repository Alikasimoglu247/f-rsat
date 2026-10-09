import { expect, test } from "@playwright/test";
import pg from "pg";
import legacy from "../../src/data/silivri-research.json" with { type: "json" };
import { resetE2eFixtures } from "./reset";

// Deliberately synthetic persisted observations, confined to the guarded _e2e DB.
// This verifies UI evidence handling; it does not claim a live market change.
async function withTestPool(work: (pool: pg.Pool) => Promise<void>) {
  const target = process.env.DATABASE_URL;
  if (!target || !new URL(target).pathname.endsWith("_e2e"))
    throw new Error(
      "Araştırma testleri yalnızca ayrı E2E veritabanında çalışır.",
    );
  const pool = new pg.Pool({ connectionString: target });
  try {
    await work(pool);
  } finally {
    await pool.end();
  }
}

test.beforeAll(async () => {
  await resetE2eFixtures();
  await withTestPool(async (pool) => {
    await pool.query('TRUNCATE TABLE "ResearchRun", "ResearchResource"');
    await pool.query('DELETE FROM "SchedulerHealth" WHERE id = $1', [
      "investment-research",
    ]);
    const now = new Date();
    const previousAt = new Date(now.getTime() - 60_000).toISOString();
    const currentAt = now.toISOString();
    const first = structuredClone(legacy) as typeof legacy & {
      sources: ((typeof legacy.sources)[number] & { checkStatus?: string })[];
    };
    first.researchedAt = previousAt;
    first.sources = first.sources.map((source) => ({
      ...source,
      retrievedAt: previousAt,
      checkStatus: "VALID",
    }));
    first.candidates = first.candidates.map((candidate) => ({
      ...candidate,
      observedAt: previousAt,
    }));
    const second = structuredClone(first);
    second.researchedAt = currentAt;
    second.sources = second.sources.map((source) => ({
      ...source,
      retrievedAt: currentAt,
      checkStatus: source.id === "genc-300" ? "FAILED" : "VALID",
    }));
    second.candidates = second.candidates.map((candidate) => ({
      ...candidate,
      observedAt: currentAt,
    }));
    // Mismatched periods must never be deflated together.
    second.facts = second.facts.map((fact) =>
      fact.id === "cpi-august" ? { ...fact, period: "2026-07" } : fact,
    );
    const sourceUrl = second.sources.find(
      (source) => source.id === "genc-300",
    )!.url;
    const farm = second.candidates.find(
      (candidate) => candidate.id === "genc-farm250",
    )!;
    const originalFarmUrl = farm.sourceUrl;
    farm.sourceUrl += "?utm_source=e2e-synthetic";
    second.sources.find((source) => source.id === farm.sourceId)!.url =
      farm.sourceUrl;
    await pool.query(
      'INSERT INTO "ListingSource" (id,name,method,"authorization","accessStatus",categories) VALUES ($1,$2,$3,$4,$5,ARRAY[\'TARLA\']::"Category"[])',
      [
        "e2e-synthetic-public-research",
        "E2E sentetik kaynak",
        "PUBLIC_RESEARCH",
        "Yalnızca ayrı test veritabanındaki sentetik kayıt",
        "AVAILABLE",
      ],
    );
    await pool.query(
      'INSERT INTO "Listing" (id,title,category,province,district,neighborhood,"transactionType",price,"sourceUrl","externalId","identityKey","sourceId","isDemo",provenance,"lastObservedAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13::jsonb,$14,$14)',
      [
        "e2e-synthetic-price-conflict",
        "E2E sentetik eski fiyat kaydı",
        "TARLA",
        farm.province,
        farm.district,
        farm.neighborhood,
        "Satılık",
        "450000.00",
        originalFarmUrl,
        farm.externalId,
        "e2e-synthetic-price-key",
        "e2e-synthetic-public-research",
        "{}",
        currentAt,
      ],
    );
    const checks = [
      {
        url: sourceUrl,
        status: "FAILED",
        checkedAt: currentAt,
        reason:
          "E2E testinde son kaynak kontrolü başarısız; önceki fiyat güncel kanıt değil.",
      },
      {
        url: second.sources[0].url,
        status: "PARSED",
        checkedAt: currentAt,
        sha256: second.sources[0].sha256,
      },
    ];
    const summary = {
      checkedUrls: 2,
      parsedSources: 1,
      newSourceUrls: 0,
      newCandidates: 0,
      inserted: 0,
      updated: 0,
      priceChanges: 0,
      factChanges: 1,
      decisionRevisions: 1,
      invalidatedSources: 1,
      unchangedCandidates: 4,
    };
    const changes = [
      {
        kind: "SOURCE_INVALIDATED",
        key: sourceUrl,
        before: "VALID",
        after: "FAILED",
        reason:
          "E2E testinde son kontrol başarısız olduğu için önceki olumlu gerekçe karardan çıkarıldı.",
      },
    ];
    for (const [
      id,
      snapshot,
      at,
      trigger,
      runSummary,
      runChanges,
      runChecks,
    ] of [
      [
        "e2e-synthetic-research-first",
        first,
        previousAt,
        "MANUAL",
        {
          ...summary,
          newSourceUrls: 12,
          newCandidates: 5,
          factChanges: 0,
          decisionRevisions: 0,
          invalidatedSources: 0,
        },
        [],
        [],
      ],
      [
        "e2e-synthetic-research-second",
        second,
        currentAt,
        "SCHEDULED_PROBE",
        summary,
        changes,
        checks,
      ],
    ] as const) {
      await pool.query(
        'INSERT INTO "ResearchRun" (id, trigger, segment, status, "startedAt", "completedAt", summary, snapshot, decisions, changes, checks, discoveries) VALUES ($1,$2,$3,$4,$5,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb)',
        [
          id,
          trigger,
          "SILIVRI_DEGIRMENKOY_SMALL_LAND",
          "COMPLETED",
          at,
          JSON.stringify(runSummary),
          JSON.stringify(snapshot),
          "[]",
          JSON.stringify(runChanges),
          JSON.stringify(runChecks),
          "[]",
        ],
      );
    }
    await pool.query(
      'INSERT INTO "SchedulerHealth" (id, "instanceId", status, "lastHeartbeatAt", "lastTickAt", "lastResult", schedule, timezone) VALUES ($1,$2,$3,$4,$4,$5,$6,$7)',
      [
        "investment-research",
        "e2e-synthetic-scheduler",
        "STOPPED",
        currentAt,
        "SCHEDULED_PROBE:COMPLETED",
        "* * * * * *",
        "Europe/Istanbul",
      ],
    );
  });
});

test.afterAll(async () => {
  await withTestPool(async (pool) => {
    await pool.query('TRUNCATE TABLE "ResearchRun", "ResearchResource"');
    await pool.query('DELETE FROM "SchedulerHealth" WHERE id = $1', [
      "investment-research",
    ]);
    await pool.query('DELETE FROM "Listing" WHERE id = $1', [
      "e2e-synthetic-price-conflict",
    ]);
    await pool.query('DELETE FROM "ListingSource" WHERE id = $1', [
      "e2e-synthetic-public-research",
    ]);
  });
});

test("URL eşleşmesi güncel kaynak fiyatını uzlaştırılmamış eski veritabanı kaydıyla birleştirmez", async ({
  page,
}) => {
  await page.goto("/yatirim-analizi");
  const candidate = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "E2E sentetik eski fiyat kaydı",
      exact: true,
    }),
  });
  await expect(candidate).toContainText("₺450.000");
  await expect(candidate).toContainText("Yetersiz veri");
  await expect(candidate).toContainText(
    "güncel fiyat veritabanı kaydıyla uzlaştırılamadı",
  );
  await expect(
    candidate.getByRole("link", {
      name: "Fiyat geçmişini ve eşleşen emsalleri incele →",
    }),
  ).toHaveAttribute("href", "/ilan/e2e-synthetic-price-conflict");
  const result = await (await page.request.get("/api/investment")).json();
  const stored = result.pilots[0].decisions.find(
    (item: { id: string }) => item.id === "e2e-synthetic-price-conflict",
  );
  expect(stored).toMatchObject({
    price: "450000.00",
    priceCurrent: false,
    assessment: null,
    verdict: "Yetersiz veri",
  });
  expect(result.pilots[0].decisions).toHaveLength(5);
});

test("araştırma geçmişi gerçek zamanlayıcı denemesini günlük başarıdan ayırır", async ({
  page,
}) => {
  await page.goto("/yatirim-analizi");
  const cycle = page.getByRole("region", { name: "Araştırma döngüsü" });
  await expect(cycle).toContainText("Durdurulmuş");
  await expect(cycle).toContainText("Gerçek zamanlayıcı denemesi");
  await expect(cycle).toContainText(
    "günlük programla tamamlanan araştırma yok",
  );
  await expect(cycle.getByRole("row")).toHaveCount(3);
  await expect(cycle).toContainText("e2e-synthetic-research-first");
  await expect(cycle).toContainText("e2e-synthetic-research-second");
  await cycle
    .getByText("Son çalışmada kararlar neden yeniden değerlendirildi?", {
      exact: true,
    })
    .click();
  await expect(cycle).toContainText("önceki olumlu gerekçe karardan çıkarıldı");
  await cycle
    .getByText("Son kaynak kontrolleri ve engeller", { exact: true })
    .click();
  await expect(cycle).toContainText("önceki fiyat güncel kanıt değil");
  const result = await (await page.request.get("/api/investment")).json();
  expect(result.researchLoop.mode).toBe("PERSISTED_RESEARCH");
  expect(result.researchLoop.dailyRunCount).toBe(0);
  expect(result.researchLoop.history[0]).toMatchObject({
    fetchedChecks: 1,
    checkedUrls: 2,
    newCandidates: 0,
    factChanges: 1,
    invalidatedSources: 1,
  });
});

test("başarısız güncel kontrol eski fiyatı ve uyumsuz dönemleri fırsat kanıtı yapmaz", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/yatirim-analizi");
  const candidate = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: legacy.candidates.find((item) => item.id === "genc-300")!.title,
      exact: true,
    }),
  });
  await expect(candidate).toContainText(
    "Geçmiş veya uzlaştırılmamış fiyat/özellik gözlemi",
  );
  await expect(candidate).toContainText("Yetersiz veri");
  await expect(candidate).not.toContainText("Hesaplanan istenen birim fiyat");
  await expect(
    page.getByText("Güncel ve aynı döneme ait kanıt eksik", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const result = await (await page.request.get("/api/investment")).json();
  expect(
    result.sources.find((source: { id: string }) => source.id === "genc-300")
      .fresh,
  ).toBe(false);
  expect(result.istanbulRealChange).toBeNull();
  expect(result.pilots[0].reviewCount).toBe(0);
  await page.getByRole("button", { name: "Marmara SUV", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});
