import { test, expect } from "@playwright/test";
import { resetE2eFixtures } from "./reset";
test.beforeAll(resetE2eFixtures);
test("boş gerçek DB eski araştırma JSON adaylarını aktif fırsat gibi göstermez", async ({
  page,
}) => {
  await page.goto("/yatirim-analizi");
  await expect(
    page.getByRole("heading", { name: "Yatırım analizi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "İlk kurulum durumu" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  const report = await (await page.request.get("/api/investment")).json();
  expect(report.pilots[0]).toMatchObject({
    databaseCount: 0,
    activeCount: 0,
    reviewCount: 0,
  });
  expect(report.pilots[0].decisions).toHaveLength(0);
  expect(report.pilots[0].archive).toHaveLength(5);
  expect(report.sources.every((s: { fresh: boolean }) => !s.fresh)).toBe(true);
  await page.getByRole("button", { name: /Geçmiş araştırma arşivi/ }).click();
  await expect(page.getByRole("article")).toHaveCount(5);
  const villa = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Kılıç Ceylan Country" }),
    });
  await expect(villa).toContainText("Fiyat açıklanmamış");
  await expect(villa).toContainText("Yetersiz veri");
  await villa.getByRole("button", { name: "Analizi aç", exact: true }).click();
  const detail = page.getByRole("dialog");
  await expect(detail).toContainText("olumlu yatırım gerekçesi üretilmedi");
  await expect(detail).toContainText("Daha iyi alternatifler");
  await detail
    .getByText("Derin araştırma · kaynaklar, yöntem ve karar geçmişi", {
      exact: true,
    })
    .click();
  await expect(
    detail.getByText("Arşiv / geçersiz", { exact: true }).first(),
  ).toBeVisible();
});
test("SUV pilotu demoları gerçek saymaz; koyu tema ve mobil analiz taşmaz", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/yatirim-analizi");
  await page.getByRole("button", { name: "Marmara SUV", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Bu pilotta henüz gerçek kayıt yok" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
