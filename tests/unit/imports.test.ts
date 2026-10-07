import { describe, it, expect } from "vitest";
import { parseImport, ImportValidationError } from "../../src/lib/imports";
import { listingSchema, priceSchema } from "../../src/lib/validation";
import { canonicalUrl, identityKey } from "../../src/lib/listings";
const row = {
  title: "Örnek daire",
  category: "EV",
  province: "İstanbul",
  district: "Kadıköy",
  price: "1250000.50",
};
describe("girdi güvenliği ve içe aktarma", () => {
  it("parayı metin ve en fazla iki ondalık basamakla kabul eder", () => {
    expect(priceSchema.parse("1250000.50")).toBe("1250000.50");
    for (const value of [1250000.5, "0", "-1", "1e9", "12.123"])
      expect(priceSchema.safeParse(value).success).toBe(false);
  });
  it("false CSV değeri demo bayrağını açmaz", () =>
    expect(
      parseImport(
        "title,category,province,district,price,isDemo\nÖrnek daire,EV,İstanbul,Kadıköy,1250000,false",
        "CSV",
      )[0].isDemo,
    ).toBe(false));
  it("boş opsiyonel alanları sıfır olarak uydurmaz", () => {
    const parsed = listingSchema.parse({ ...row, mileage: "", sizeM2: "" });
    expect(parsed.mileage).toBeUndefined();
    expect(parsed.sizeM2).toBeUndefined();
  });
  it("hatalı satırları numaralarıyla raporlar", () => {
    try {
      parseImport(
        "title,category,province,district,price\nÖrnek daire,EV,İstanbul,Kadıköy,1250000\nYanlış ilan,EV,Ankara,Çankaya,-1",
        "CSV",
      );
      throw new Error("beklenen hata yok");
    } catch (error) {
      expect(error).toBeInstanceOf(ImportValidationError);
      expect((error as ImportValidationError).rows[0].row).toBe(3);
    }
  });
  it("JSON ve izinli yapılandırılmış e-posta gövdesini işler", () => {
    expect(parseImport(JSON.stringify([row]), "JSON")).toHaveLength(1);
    expect(parseImport(JSON.stringify([row]), "EMAIL")).toHaveLength(1);
  });
  it("script URL, kimlik bilgili URL, fazladan alan ve aşırı dosyayı reddeder", () => {
    for (const sourceUrl of [
      "javascript:alert(1)",
      "https://user:pass@example.com",
    ])
      expect(listingSchema.safeParse({ ...row, sourceUrl }).success).toBe(
        false,
      );
    expect(listingSchema.safeParse({ ...row, secret: "x" }).success).toBe(
      false,
    );
    expect(() => parseImport("x".repeat(2_000_001), "CSV")).toThrow();
  });
  it("URL izleme parametrelerini temizler, gerçek kimlik parametresini korur", () =>
    expect(
      canonicalUrl("https://example.com/ilan/?id=42&utm_source=mail#top"),
    ).toBe("https://example.com/ilan?id=42"));
  it("aynı ilanın fiyatı değişince parmak izi değişmez", () => {
    const a = listingSchema.parse(row),
      b = listingSchema.parse({ ...row, price: "999999" });
    expect(identityKey(a)).toBe(identityKey(b));
  });
});
