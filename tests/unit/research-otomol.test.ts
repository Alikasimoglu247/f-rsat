import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { parseOtomolVehicle } from "@/lib/research/otomol";
import { researchDecision, research } from "@/lib/investment";

// Synthetic excerpts reproduce the field structure validated against the public EX40 page.
function page(
  options: {
    bodyType?: string;
    address?: string;
    displayedPrice?: string;
    propsId?: number;
  } = {},
) {
  const props = {
    marka: "VOLVO",
    model: "EX40",
    altModel: "Extended Range Ultra",
    ilanNo: options.propsId ?? 9458,
    fiyat: "3.300.000",
    modelYili: 2026,
    km: 8841,
  };
  const fields = {
    "İlan No": "9458",
    "Kasa Tipi": options.bodyType ?? "SUV",
    "Model Yılı": "2026",
    Kilometre: "8.841",
    "Yakıt Türü": "Elektrik",
    "Vites Tipi": "Otomatik",
  };
  const body = `<h1>VOLVO EX40 Extended Range Ultra</h1><span class="text-2xl">₺${options.displayedPrice ?? "3.300.000"}</span>${Object.entries(
    fields,
  )
    .map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`)
    .join(
      "",
    )}<div><span>Şube</span><h3>Otomol Merter</h3><p>${options.address ?? "Osmaniye Mah. E-5 Sok. Bakırköy/İstanbul"}</p></div><p>Hasar kaydı bulunmamaktadır.</p><script>self.__next_f.push([1,${JSON.stringify("15:" + JSON.stringify({ props }) + "\n")}])</script><script>globalThis.UNTRUSTED_TEST_SCRIPT_EXECUTED=true</script>`;
  return {
    url: "https://www.otomol.com/volvo-ex40-extended-range-ultra-2026-ikinci-el-araba-9458",
    body,
    status: 200,
    checkedAt: "2026-10-10T08:00:00.000Z",
    sha256: createHash("sha256").update(body).digest("hex"),
    contentType: "text/html",
  };
}
it("ilan kimliği, seçili fiyat, JSON ve Marmara adresi aynı gerçek özneye bağlanır", () => {
  const result = parseOtomolVehicle(page())!;
  expect(result.candidate).toMatchObject({
    externalId: "9458",
    price: "3300000",
    province: "İstanbul",
    district: "Bakırköy",
    publishedAt: null,
    vehicle: {
      bodyType: "SUV",
      bodyTypeVerified: true,
      mileage: 8841,
      modelYear: 2026,
      damageHistory: null,
    },
  });
  expect(
    (globalThis as Record<string, unknown>).UNTRUSTED_TEST_SCRIPT_EXECUTED,
  ).toBeUndefined();
});
it("fiyat veya kimlik çelişkisi ve yalnızca şube lakabı olan konum kabul edilmez", () => {
  expect(parseOtomolVehicle(page({ displayedPrice: "2.900.000" }))).toBeNull();
  expect(parseOtomolVehicle(page({ propsId: 9459 }))).toBeNull();
  expect(parseOtomolVehicle(page({ address: "Otomol Merter" }))).toBeNull();
  expect(parseOtomolVehicle(page({ address: "Çankaya/Ankara" }))).toBeNull();
});
it("SUV model adı gövde alanının yerine geçmez; eksik sınıflandırma inceleme bekler", () => {
  expect(parseOtomolVehicle(page({ bodyType: "Sedan" }))).toBeNull();
  expect(
    parseOtomolVehicle(page({ bodyType: "Bilgi yok" }))?.candidate.vehicle
      ?.bodyTypeVerified,
  ).toBe(false);
});
it("hasarsız/garantili/satışta varsayımı ve yeterli emsal olmadan fırsat üretmez", () => {
  const result = parseOtomolVehicle(page())!;
  const data = {
    ...research,
    sources: [result.source],
    facts: result.facts,
    candidates: [result.candidate],
  };
  const decision = researchDecision(
    result.candidate,
    new Date(page().checkedAt),
    null,
    data,
  );
  expect(decision.verdict).toBe("Yetersiz veri");
  expect(decision.missing.join(" ")).toContain("hasar geçmişi");
  expect(decision.missing.join(" ")).toContain("satış mevcudiyeti");
  expect(decision.missing.join(" ")).toContain("Batarya sağlık raporu");
  expect(decision.missing).not.toContain("Model");
  expect(decision.missing).not.toContain("Kilometre");
  expect(
    decision.whyNot.some(
      (r) => r.text.includes("8.841 km") && r.evidenceIds.length > 0,
    ),
  ).toBe(true);
});
