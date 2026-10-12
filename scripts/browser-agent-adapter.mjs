/** This module consumes a supported Codex Tab handle. It never launches or impersonates a browser. */
export async function captureSelectedListing(tab, expectedUrl) {
  if (!tab?.playwright?.evaluate || !tab?.url)
    throw new Error("BROWSER_RUNTIME_UNAVAILABLE: Codex yerleşik Tab aracı bu Node sürecinde yok.");
  if (await tab.url() !== expectedUrl)
    throw new Error("BROWSER_URL_MISMATCH: Seçilen ilan ve açık sekme eşleşmiyor.");
  await tab.playwright.domSnapshot();
  const capture = await tab.playwright.evaluate(() => {
    const host = location.hostname.replace(/^www\./, "");
    let text = document.body.innerText;
    if (host === "hepsiemlak.com")
      text = text.split("Akıllı Özet")[0] + "\n" + (document.querySelector("#ilanBilgileri")?.innerText ?? "");
    else text = text.split("Benzer Araçlar")[0].split("Benzer İlanlar")[0];
    // Do not transmit the footer, enquiry contact details or whole copied pages.
    text = text.split("İlan Açıklaması\n")[0].split("©")[0]
      .split("\n").filter(line => !/@|(?:\+?90\s*)?0?5\d{2}[\s()-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}|^\s*444/.test(line)).join("\n");
    return { url: location.href, title: document.querySelector("h1")?.textContent?.trim() ?? "", text: text.slice(0, 60000) };
  });
  if (!capture.title || /verify you are human|access denied|güvenlik doğrulaması|erişim engellendi/i.test(capture.text))
    throw new Error("BROWSER_ACCESS_BLOCKED: Normal erişimle seçilen ilan okunamadı.");
  return { ...capture, observedAt: new Date().toISOString() };
}

/** One agent operation: selected DOM -> existing local bridge -> parsed preview or authorized record. */
export async function runSelectedJob({ appTab, sourceTab, jobId, url }) {
  const snapshot = await captureSelectedListing(sourceTab, url);
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):3000\/kesfet$/.test(await appTab.url()))
    throw new Error("LOCAL_BRIDGE_URL_REQUIRED");
  await appTab.playwright.domSnapshot();
  const select = appTab.playwright.getByRole("combobox", { name: "Ajan iş isteği", exact: true });
  if (!await select.isVisible()) {
    await appTab.playwright.getByText("Codex ajan bağlantısı", { exact: true }).click();
    await appTab.playwright.domSnapshot();
  }
  await select.selectOption(jobId);
  await appTab.playwright.getByRole("button", { name: "Ajan isteğini al", exact: true }).click();
  await appTab.playwright.domSnapshot();
  await appTab.playwright.getByRole("textbox", { name: "Tarayıcı DOM sonucu", exact: true }).fill(JSON.stringify(snapshot));
  await appTab.playwright.getByRole("button", { name: "Tarayıcı sonucunu işle", exact: true }).click();
  await appTab.playwright.getByRole("status").filter({ hasText: /Gerçek ilan ayrıştırıldı|Araştırma sonucu kaydedildi/ }).waitFor({state:"visible",timeoutMs:10000});
  return {jobId, status:await appTab.playwright.getByRole("status").innerText(), observedAt:snapshot.observedAt};
}
