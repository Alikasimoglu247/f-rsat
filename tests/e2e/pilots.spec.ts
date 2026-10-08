import { test, expect } from "@playwright/test";
import { resetE2eFixtures } from "./reset";
test.beforeAll(resetE2eFixtures);
test("iki pilot kartı boş gerçek kapsamı, canlı alım eksikliğini ve mobil görünümü gösterir", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "Silivri Gayrimenkul Fırsatları",
    "Marmara SUV Fırsatları",
  ]) {
    const card = page.getByRole("article", { name });
    await expect(card).toContainText("henüz gerçek ilan yok");
    await expect(card).toContainText("canlı bildirim alımı doğrulanmadı");
    await expect(card.locator("dd")).toHaveText(["0", "0", "0", "0"]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("pilot ilçe, kategori, gövde tipi ve bütçe filtreleri düzenlenip kalıcı saklanır", async ({
  page,
}) => {
  await page.goto("/");
  const name = "Silivri Gayrimenkul Fırsatları",
    card = page.getByRole("article", { name });
  await card.locator("summary").click();
  await card.getByLabel(`${name} · İlçe`, { exact: true }).fill("Çatalca");
  await card.getByLabel(`${name} · Kategoriler`).selectOption(["ARSA"]);
  await card.getByLabel(`${name} · Üst bütçe`).fill("7500000");
  await card.getByRole("button", { name: "Pilot filtrelerini kaydet" }).click();
  await expect(card.getByRole("status")).toContainText("kaydedildi");
  await page.reload();
  await card.locator("summary").click();
  await expect(card.getByLabel(`${name} · İlçe`, { exact: true })).toHaveValue(
    "Çatalca",
  );
  await expect(card.getByLabel(`${name} · Üst bütçe`)).toHaveValue("7500000");
  const suvName = "Marmara SUV Fırsatları",
    suv = page.getByRole("article", { name: suvName });
  await suv.locator("summary").click();
  await suv
    .getByLabel(`${suvName} · Araç gövde tipleri`)
    .selectOption(["CROSSOVER"]);
  await suv.getByRole("button", { name: "Pilot filtrelerini kaydet" }).click();
  await expect(suv.getByRole("status")).toContainText("kaydedildi");
  const response = await page.request.get("/api/settings"),
    data = await response.json();
  expect(
    data.profiles.find((p: { id: string }) => p.id === "pilot-marmara-suv")
      .bodyTypes,
  ).toEqual(["CROSSOVER"]);
});
test("belirsiz SUV incelemeden sonra pilota alınır; yeterli emsal yoksa fırsat olmaz", async ({
  page,
}) => {
  const response = await page.request.post("/api/listings", {
    data: {
      title: "Sentetik pilot SUV test aracı",
      category: "ARABA",
      province: "Bursa",
      district: "Nilüfer",
      externalId: "pilot-browser-suv",
      price: "1500000",
      make: "Toyota",
      model: "RAV4",
      trim: "Dream",
      bodyType: "CROSSOVER",
      fuel: "Hibrit",
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  const card = page.getByRole("article", { name: "Marmara SUV Fırsatları" });
  await expect(card.locator("dd").first()).toHaveText("0");
  await page.goto("/veri-kaynaklari");
  const review = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Sentetik pilot SUV test aracı" }),
  });
  await review.getByLabel("Doğrulanan gövde tipi").selectOption("CROSSOVER");
  await review
    .getByLabel("İncelenen kaynak / kanıt açıklaması")
    .fill("Sentetik test belgesi; gerçek platform kanıtı değildir");
  await review.getByLabel("Kaynak kanıtını inceledim").check();
  await review.getByRole("button", { name: "Gövde tipini onayla" }).click();
  await expect(
    page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "Sentetik pilot SUV test aracı",
      }),
    }),
  ).toHaveCount(0);
  await page.goto("/");
  await expect(card.locator("dd").first()).toHaveText("1");
  await expect(card).toContainText("Yeterli emsale sahip gerçek fırsat yok");
});
