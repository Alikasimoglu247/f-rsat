import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resetE2eFixtures } from "./reset";
test.beforeAll(resetE2eFixtures);
test("gerçek veri boşken huni sebebi, kurulum gereksinimi ve yeni ekran dürüstçe gösterilir", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.getByRole("article", {
    name: "Silivri Gayrimenkul Fırsatları",
  });
  await expect(card.locator(".pilot-funnel dd")).toHaveText([
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
  ]);
  await expect(card).toContainText("Bu pilot için Gmail bildirimi yok");
  await page.goto("/yeni-ilanlar");
  await expect(
    page.getByText("Henüz gerçek ilan yok", { exact: true }),
  ).toBeVisible();
  await page.goto("/veri-kaynaklari");
  const setup = page.getByRole("region", { name: "Canlı pilot kurulumu" });
  await expect(setup).toContainText(
    "Gerçek Sahibinden ve Arabam bildirimlerini",
  );
  await expect(setup).toContainText("Canlı şablon doğrulaması yok");
  await expect(setup).toContainText("Başlatılmadı");
});
test("eksik bildirim kullanıcı tarafından tamamlanır; yeni ekranda puansız görünür ve günlük hunide yer alır", async ({
  page,
}) => {
  const raw = (
    await readFile("tests/fixtures/emails/sahibinden-synthetic.eml", "utf8")
  )
    .replaceAll("Kadıköy", "Silivri")
    .replace("Konum: İstanbul / Silivri\n", "")
    .replace("Sentetik test arama bildirimi", "M22 eksik konum testi");
  await page.goto("/veri-kaynaklari");
  await page
    .getByLabel("Bu bildirimi ve içerdiği veriyi işleme yetkim var.")
    .check();
  await page
    .getByLabel("Bu bildirim hangi pilotlara ait?")
    .selectOption(["pilot-silivri"]);
  await page.getByLabel("Bildirim .eml dosyası").setInputFiles({
    name: "controlled-test.eml",
    mimeType: "message/rfc822",
    buffer: Buffer.from(raw),
  });
  const receipt = page
    .locator(".email-receipt")
    .filter({ hasText: "M22 eksik konum testi" })
    .first();
  await receipt.locator("summary").first().click();
  await receipt
    .getByText("Eksik alanları kaynak kanıtıyla tamamla", { exact: true })
    .click();
  const form = receipt.locator(".email-proposal form");
  await form
    .getByRole("combobox", { name: "İl", exact: true })
    .selectOption("İstanbul");
  await form.getByLabel("İlçe", { exact: true }).fill("Silivri");
  await form.getByLabel("Mahalle", { exact: true }).fill("Alibey");
  await form
    .getByLabel("İşlem (SATILIK / KIRALIK)", { exact: true })
    .fill("SATILIK");
  await form
    .getByLabel("İncelediğin kaynak / belge açıklaması")
    .fill("Sentetik fixture özellikleri kontrol edildi");
  await form.getByLabel(/Bu bilgileri kaynakta kontrol ettim/).check();
  await form.getByRole("button", { name: "Eksik alanları kaydet" }).click();
  await expect(receipt).toContainText("Kullanıcı tamamlaması");
  await receipt
    .getByLabel(/Bu gerçek, izinli örnekte alanlar doğru ayrıştırılmış/)
    .check();
  await receipt
    .getByRole("button", { name: "Şablonu onayla ve aktar" })
    .click();
  await expect(receipt).toContainText("Aktarıldı");
  await page.goto("/yeni-ilanlar");
  await page.getByLabel("Pilot filtresi").selectOption("pilot-silivri");
  await expect(
    page.getByRole("heading", { name: "Sentetik test Silivri dairesi" }),
  ).toBeVisible();
  await expect(
    page.getByText("Yeterli kanıtlı fırsat", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Eksik veriler:.*Net m²/)).toBeVisible();
  await page.goto("/veri-kaynaklari");
  await page.getByRole("button", { name: /Günlük analizi çalıştır/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /ilan analiz edildi/ }),
  ).toBeVisible();
  await page.goto("/");
  const card = page.getByRole("article", {
    name: "Silivri Gayrimenkul Fırsatları",
  });
  await expect(card.locator(".pilot-funnel dd")).toHaveText([
    "0",
    "1",
    "0",
    "1",
    "1",
    "1",
    "0",
  ]);
  await page.goto("/bildirimler");
  const report = page.locator(".email-receipt").first();
  await report.locator("summary").click();
  await expect(report).toContainText("Huni:");
  await expect(report).toContainText("1 emsal yetersiz");
});
