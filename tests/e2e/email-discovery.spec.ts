import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resetE2eFixtures } from "./reset";
test.beforeAll(resetE2eFixtures);
test("OAuth olmadan .eml inceleme, açık şablon onayı, kalıcı gerçek ilan ve tekrar önleme", async ({
  page,
}) => {
  await page.goto("/veri-kaynaklari");
  await expect(
    page.getByRole("button", { name: "Google ile salt-okunur bağlan" }),
  ).toBeDisabled();
  await page
    .getByLabel("Bu bildirimi ve içerdiği veriyi işleme yetkim var.")
    .check();
  const file = {
    name: "test-notification.eml",
    mimeType: "message/rfc822",
    buffer: await readFile("tests/fixtures/emails/sahibinden-synthetic.eml"),
  };
  await page.getByLabel("Bildirim .eml dosyası").setInputFiles(file);
  const receipt = page
    .locator(".email-receipt")
    .filter({ hasText: "Sentetik test arama bildirimi" })
    .first();
  await expect(receipt).toContainText("İnceleme bekliyor");
  await receipt.locator("summary").first().click();
  await expect(receipt).toContainText("4.250.000,50");
  await expect(receipt).toContainText("İstanbul / Kadıköy");
  await expect(
    receipt.getByRole("button", { name: "Şablonu onayla ve aktar" }),
  ).toBeDisabled();
  await receipt
    .getByLabel(/Bu gerçek, izinli örnekte alanlar doğru ayrıştırılmış/)
    .check();
  await receipt
    .getByRole("button", { name: "Şablonu onayla ve aktar" })
    .click();
  await expect(receipt).toContainText("Aktarıldı");
  await expect(
    page
      .getByText("Örnek kullanıcı tarafından onaylandı", { exact: false })
      .first(),
  ).toBeVisible();
  await page.getByLabel("Bildirim .eml dosyası").setInputFiles(file);
  await expect(page.getByRole("status")).toContainText("daha önce işlenmiş");
  await page.goto("/firsatlar");
  await expect(
    page.getByRole("heading", { name: "Sentetik test Kadıköy dairesi" }),
  ).toBeVisible();
});
test("eksik alan ve belirsiz fiyat şablonu onaylanamaz", async ({ page }) => {
  const raw = (await readFile("tests/fixtures/emails/sahibinden-synthetic.eml"))
    .toString()
    .replace("Konum: İstanbul / Kadıköy", "")
    .replace("4.250.000,50 TL", "4.000.000 TL\nÖnceki: 4.500.000 TL")
    .replace("Sentetik test arama bildirimi", "Eksik alan test bildirimi");
  await page.goto("/veri-kaynaklari");
  await page
    .getByLabel("Bu bildirimi ve içerdiği veriyi işleme yetkim var.")
    .check();
  await page.getByLabel("Bildirim .eml dosyası").setInputFiles({
    name: "incomplete.eml",
    mimeType: "message/rfc822",
    buffer: Buffer.from(raw),
  });
  const receipt = page
    .locator(".email-receipt")
    .filter({ hasText: "Eksik alan test bildirimi" })
    .first();
  await expect(receipt).toContainText("İnceleme bekliyor");
  await receipt.locator("summary").first().click();
  await receipt
    .getByLabel(/Bu gerçek, izinli örnekte alanlar doğru ayrıştırılmış/)
    .check();
  await expect(
    receipt.getByRole("button", { name: "Şablonu onayla ve aktar" }),
  ).toBeDisabled();
  await expect(receipt).toContainText("Eksik alanlar:");
});
test("email HTML gövdesi DOM'a çalıştırılmaz; görsel veya izleme bağlantısı yüklenmez", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url());
  });
  await page.goto("/veri-kaynaklari");
  await page
    .getByLabel("Bu bildirimi ve içerdiği veriyi işleme yetkim var.")
    .check();
  const raw = (await readFile("tests/fixtures/emails/arabam-synthetic.eml"))
    .toString()
    .replace("</body>", "<script>window.emailInjected=true</script></body>");
  await page.getByLabel("Bildirim .eml dosyası").setInputFiles({
    name: "unsafe-html.eml",
    mimeType: "message/rfc822",
    buffer: Buffer.from(raw),
  });
  await expect(
    page
      .locator(".email-receipt")
      .filter({ hasText: "Sentetik test araç bildirimi" }),
  ).toContainText("İnceleme bekliyor");
  expect(await page.evaluate(() => "emailInjected" in window)).toBe(false);
  expect(external).toEqual([]);
});
test("kaynak paneli mobil görünür; bildirim raporu yetersiz kayıtları fırsat olarak göstermez", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/veri-kaynaklari");
  await expect(
    page.getByRole("heading", { name: "İzinli e-posta keşfi" }),
  ).toBeVisible();
  await expect(page.getByLabel("Gerçek kaynak kapsamı")).toContainText(
    "gerçek ilan",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /Günlük analizi çalıştır/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /ilan analiz edildi/ })).toBeVisible();
  await page.goto("/bildirimler");
  await expect(
    page.getByRole("heading", { name: "Günlük gerçek fırsat raporları" }),
  ).toBeVisible();
  const report = page.locator(".email-receipt").first();
  await expect(report).toContainText("0 fırsat");
  await report.locator("summary").click();
  await expect(report).toContainText(
    "Yeterli kanıt ve puan eşiğini karşılayan gerçek fırsat yok",
  );
});
test("OAuth eksik ayarda başlatılmaz; callback gizli query'yi saklamadan temiz adrese döner", async ({
  request,
}) => {
  const connect = await request.post("/api/email/gmail/connect", {
    data: { consent: true },
  });
  expect(connect.status()).toBe(400);
  const callback = await request.get(
    "/api/email/gmail/callback?code=test-code-not-live&state=bad-state",
    { maxRedirects: 0 },
  );
  expect(callback.status()).toBe(307);
  expect(callback.headers().location).toContain("/veri-kaynaklari?gmail=error");
  expect(callback.headers().location).not.toContain("test-code");
  expect(callback.headers()["cache-control"]).toBe("no-store");
  expect(callback.headers()["referrer-policy"]).toBe("no-referrer");
});
