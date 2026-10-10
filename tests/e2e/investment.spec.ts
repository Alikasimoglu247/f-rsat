import { test, expect } from "@playwright/test";
import { resetE2eFixtures } from "./reset";
import pg from "pg";
test.beforeAll(async () => {
  await resetE2eFixtures();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query('TRUNCATE TABLE "ResearchRun", "ResearchResource"');
    await pool.query('DELETE FROM "SchedulerHealth" WHERE id = $1', [
      "investment-research",
    ]);
  } finally {
    await pool.end();
  }
});

test("yatırım ajanı gerçek tarihli kaynakları, fiyat hesabını ve eksik kanıtı gösterir", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Yatırım Analizi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Yatırım analizi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Araştırma döngüsü", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("araştırma döngüsü henüz çalıştırılmadı", { exact: false }),
  ).toBeVisible();
  const response = await page.request.get("/api/investment");
  const result = await response.json();
  if (result.istanbulRealChange != null)
    await expect(page.getByText("%-3,96", { exact: true })).toBeVisible();
  else
    await expect(
      page.getByText("Güncel ve aynı döneme ait kanıt eksik", { exact: false }),
    ).toBeVisible();
  const landFresh = result.sources.find(
    (source: { id: string }) => source.id === "genc-300",
  ).fresh;
  if (landFresh)
    await expect(
      page.getByText("₺1.466,67 / m²", { exact: true }),
    ).toBeVisible();
  else
    await expect(page.getByText("₺1.466,67 / m²", { exact: true })).toHaveCount(
      0,
    );
  await expect(page.getByRole("article")).toHaveCount(5);
  const villa = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Kılıç Ceylan Country" }),
  });
  await expect(villa).toContainText("Fiyat açıklanmamış");
  await expect(villa).toContainText("Yetersiz veri");
  await expect(villa).toContainText("Neden fırsat olabilir?");
  await expect(villa).toContainText("Daha iyi alternatif var mı?");
  const farm = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "250 m² Değirmenköy hisseli tarla",
    }),
  });
  const farmFresh = result.sources.find(
    (source: { id: string }) => source.id === "genc-farm250",
  ).fresh;
  await expect(farm).toContainText(farmFresh ? "Riskli" : "Yetersiz veri");
  if (farmFresh)
    await farm.locator('a[href="#fact-genc-farm250-risk"]').first().click();
  await expect(page.locator("#fact-genc-farm250-risk")).toContainText(
    "Yayıncı beyanı",
  );
  expect(result.pilots[0]).toMatchObject({
    databaseCount: 0,
    researchCount: 5,
    pricedCount: 4,
    reviewCount: 0,
  });
});

test("SUV pilotu demoları kullanmaz ve mobil yatırım ekranı taşmaz", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/yatirim-analizi");
  await expect(
    page.getByRole("heading", { name: "Silivri için yatırım tezi" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Marmara SUV", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Marmara SUV karar modeli" }),
  ).toBeVisible();
  await expect(
    page.getByText("Bu pilotta doğrulanabilir gerçek ilan yok.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(errors).toEqual([]);
});
