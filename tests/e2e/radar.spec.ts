import { expect, test } from "@playwright/test";
test("dashboard, dört kategori ve il/ilçe/fiyat filtreleri", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Fırsatlar, radarında." }),
  ).toBeVisible();
  await expect(page.locator(".stat-card").first()).toContainText("36");
  await page.getByRole("link", { name: "Fırsatlar", exact: true }).click();
  for (const [category, title] of [
    ["EV", "daire"],
    ["ARABA", "Corolla"],
    ["ARSA", "arsa"],
    ["TARLA", "tarımsal"],
  ]) {
    await page
      .getByRole("combobox", { name: "Kategori", exact: true })
      .selectOption(category);
    await page.getByRole("button", { name: "Filtrele", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(9);
    await expect(page.getByRole("article").first()).toContainText(title);
  }
  await page
    .getByRole("combobox", { name: "Kategori", exact: true })
    .selectOption("EV");
  await page
    .getByRole("combobox", { name: "İl", exact: true })
    .selectOption("İstanbul");
  await page.getByLabel("İlçe", { exact: true }).fill("Kadıköy");
  await page.getByLabel("Üst fiyat (₺)", { exact: true }).fill("4500000");
  await page.getByRole("button", { name: "Filtrele", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("4.250.000");
});
test("ilan detayı, saklanmış fiyatlar, emsaller ve kanıt açıklaması", async ({
  page,
}) => {
  await page.goto("/firsatlar");
  await page
    .getByRole("link", { name: /Kadıköy 2\+1 daire 1 detaylarını gör/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kanıta dayalı değerlendirme" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Karşılaştırmada kullanılan emsaller" }),
  ).toBeVisible();
  await expect(
    page.getByText("Deprem dayanımı hakkında doğrulanmış veri yok."),
  ).toBeVisible();
  await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(
    3,
  );
  await expect(page.locator("table").last().locator("tbody tr")).toHaveCount(8);
  await page.getByRole("button", { name: "Kanıt açıklamasını göster" }).click();
  await expect(page.getByRole("status")).toContainText("8 benzer");
});
test("takip listesi sayfa yenilendikten sonra kalır", async ({ page }) => {
  await page.goto("/firsatlar");
  const button = page.getByRole("button", {
    name: /Kadıköy 2\+1 daire 1 takibe al/,
  });
  await button.click();
  await page.getByRole("link", { name: "Takip Listem", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: /Kadıköy 2\+1 daire 1 takipten çıkar/ })
    .click();
  await expect(page.getByText("Takip listen henüz boş")).toBeVisible();
});
test("CSV içe aktarımı, aynı dosyada mükerrer önleme ve hatalı satır", async ({
  page,
}) => {
  const csv = `title,category,province,district,price,isDemo\n[DEMO] E2E CSV ilanı,ARSA,Yalova,Merkez,775000.25,true`;
  await page.goto("/veri-kaynaklari");
  await page
    .getByRole("button", { name: "İçe aktar", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("İçe aktarılacak içerik").fill(csv);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "İçe aktarmayı başlat" }).click();
  await expect(dialog.getByRole("status")).toContainText("1 yeni");
  await dialog.getByRole("button", { name: "İçe aktarmayı başlat" }).click();
  await expect(dialog.getByRole("status")).toContainText("1 tekrar");
  await dialog
    .getByLabel("İçe aktarılacak içerik")
    .fill(csv.replace("Yalova", "Ankara"));
  await dialog.getByRole("button", { name: "İçe aktarmayı başlat" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Satır 2");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
test("manuel giriş veri saklar ve yetersiz kanıtta puan göstermez", async ({
  page,
}) => {
  await page.goto("/firsatlar/yeni");
  await page
    .getByLabel("İlan başlığı", { exact: true })
    .fill("[DEMO] E2E manuel ev");
  await page.getByLabel("İlçe", { exact: true }).fill("Merkez");
  await page
    .getByLabel("İstenen fiyat (₺)", { exact: true })
    .fill("2000000.50");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "İlanı kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("İlan kaydedildi");
  await page.getByRole("link", { name: "İlanı aç →" }).click();
  await expect(
    page.getByRole("heading", { name: "[DEMO] E2E manuel ev", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Günlük analizi çalıştır" }).click();
  await expect(page.getByRole("status").first()).toContainText("analiz edildi");
  await expect(
    page.getByText("Güncel ve yeterince benzer en az 5 emsal gerekli.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".score")).toContainText("Kanıt yetersiz");
});
test("bildirim tercihleri, arama profili ve günlük iş idempotency", async ({
  page,
}) => {
  await page.goto("/ayarlar");
  await expect(
    page.getByRole("switch", { name: "Telegram bildirimleri" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("switch", { name: "E-posta bildirimleri" }),
  ).toBeDisabled();
  await page.getByRole("switch", { name: "Demo bildirimleri" }).click();
  await page.getByLabel("Varsayılan minimum fırsat puanı").fill("70");
  await page.getByRole("button", { name: "Tercihleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("kaydedildi");
  await page.getByLabel("Profil adı").fill("E2E Marmara radarım");
  await page.getByRole("button", { name: "Profil ekle" }).click();
  await expect(
    page.getByText("E2E Marmara radarım", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Günlük analizi çalıştır" }).click();
  await expect(page.getByRole("status").first()).toContainText("analiz edildi");
  await page.getByRole("button", { name: "Günlük analizi çalıştır" }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "zaten tamamlanmış",
  );
  await page.getByRole("link", { name: "Bildirimler", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Günlük iş kayıtları" }),
  ).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toContainText(
    "Tamamlandı",
  );
});
test("tüm sayfalar, koyu tema ve mobil görünüm çalışır", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of [
    "/",
    "/firsatlar",
    "/fiyat-gecmisi",
    "/takip-listem",
    "/veri-kaynaklari",
    "/bildirimler",
    "/ayarlar",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Veriler yükleniyor…")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Koyu tema", exact: true }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/firsatlar");
  await expect(page.getByRole("article").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("API geçersiz girdiyi ve farklı origin isteğini reddeder", async ({
  request,
}) => {
  const invalid = await request.post("/api/listings", {
    data: { title: "x", price: -1 },
  });
  expect(invalid.status()).toBe(400);
  const crossOrigin = await request.post("/api/analyze", {
    data: {},
    headers: { Origin: "https://example.net" },
  });
  expect(crossOrigin.status()).toBe(403);
  const malformed = await request.post("/api/import", {
    data: {
      format: "JSON",
      content: "invalid-json",
      permissionConfirmed: true,
    },
  });
  expect(malformed.status()).toBe(400);
  const source = await request.get("/api/sources");
  const body = await source.json();
  expect(
    body.sources.find((item: { id: string }) => item.id === "sahibinden")
      .accessStatus,
  ).toBe("PLANNED");
});
