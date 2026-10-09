import { describe, expect, it } from "vitest";
import { type Evidence } from "../../src/lib/analysis";
import {
  listingDecision,
  observedUnitPrice,
  realAnnualChange,
  research,
  researchDecision,
  researchUrlAllowed,
  sourceFresh,
  supportedFact,
} from "../../src/lib/investment";
import { researchListingInput } from "../../src/lib/research-import";

const now = new Date("2026-10-09T21:05:00Z");
describe("kaynaklara dayalı yatırım kararları", () => {
  it("geçersiz veya sıfır alan/fiyatı birim fiyat hesabına sokmaz; kaynağı kopmuş aday içe aktarılmaz", () => {
    for (const [price, area] of [
      ["440000", "0"],
      ["0", "300"],
      ["NaN", "300"],
      ["440000", "-1"],
    ])
      expect(observedUnitPrice(price, area)).toBeNull();
    const candidate = {
      ...research.candidates[1],
      sourceUrl: "https://example.com/wrong-source",
    };
    expect(researchListingInput(candidate, now)).toBeNull();
    expect(researchDecision(candidate, now).unitPrice).toBeNull();
    expect(researchDecision(candidate, now).whyCould).toHaveLength(0);
  });
  it("aynı dönem enflasyonuyla reel değişim hesaplar; farklı dönemleri karıştırmaz", () => {
    expect(
      realAnnualChange(
        supportedFact("housing-istanbul", now),
        supportedFact("cpi-august", now),
      ),
    ).toBe("-3.96");
    expect(
      realAnnualChange(
        supportedFact("housing-istanbul", now),
        supportedFact("cpi-september", now),
      ),
    ).toBeNull();
  });
  it("eksik villa fiyatını ve 0 m² kaynağını sayı/emsal/gerçek DB ilanı yapmaz", () => {
    const villa = research.candidates.find((item) => item.id === "ire-0037")!;
    const result = researchDecision(villa, now);
    expect(result).toMatchObject({
      price: null,
      unitPrice: null,
      assessment: null,
      verdict: "Yetersiz veri",
    });
    expect(researchListingInput(villa, now)).toBeNull();
    expect(result.missing).toContain("Güncel TL satış fiyatı");
  });
  it("hisseli beyanı ve spekülatif imar iddiasını olumlu yatırım sonucuna çevirmiyor", () => {
    for (const id of ["genc-farm250", "akgun-3653"]) {
      const result = researchDecision(
        research.candidates.find((item) => item.id === id)!,
        now,
      );
      expect(result.verdict).toBe("Riskli");
      expect(
        result.whyNot.some(
          (reason) => reason.kind === "PUBLISHER" && reason.evidenceIds.length,
        ),
      ).toBe(true);
      expect(result.assessment).toBeNull();
    }
  });
  it("gerçek TL/m² aritmetiği farklı imar/hisse sınıflarını ucuzluk sıralamasına dönüştürmez", () => {
    const c = research.candidates.find((item) => item.id === "genc-300")!;
    expect(researchDecision(c, now)).toMatchObject({
      unitPrice: "1466.67",
      verdict: "Yetersiz veri",
    });
    expect(researchDecision(c, now).alternatives).toContain(
      "doğrudan emsal yapılmaz",
    );
  });
  it("eskimiş/future tarihli veya bütünlük kanıtı olmayan kaynak karar sayısını desteklemez", () => {
    const source = research.sources[0];
    expect(sourceFresh(source, now)).toBe(true);
    expect(
      sourceFresh({ ...source, retrievedAt: "2027-01-01T00:00:00Z" }, now),
    ).toBe(false);
    expect(sourceFresh({ ...source, sha256: "" }, now)).toBe(false);
    const later = new Date("2027-01-01T00:00:00Z");
    expect(supportedFact("policy-rate", later)).toBeNull();
    expect(researchListingInput(research.candidates[1], later)).toBeNull();
    expect(
      researchDecision(research.candidates[1], later).unitPrice,
    ).toBeNull();
    expect(researchDecision(research.candidates[2], later).verdict).toBe(
      "Yetersiz veri",
    );
  });
  it("Sahibinden ve kimlik bilgisi içeren kaynak URL'lerini kabul etmez", () => {
    for (const url of [
      "https://sahibinden.com/",
      "https://x.sahibinden.com/",
      "https://u:p@example.com/",
      "javascript:alert(1)",
    ])
      expect(researchUrlAllowed(url)).toBe(false);
    expect(researchUrlAllowed("https://www.tcmb.gov.tr/")).toBe(true);
  });
  it("bütün kanıt referansları gerçek kaynaklara bağlıdır; ilan beyanı resmî bilgi değildir", () => {
    for (const fact of research.facts)
      expect(
        research.sources.some((source) => source.id === fact.sourceId),
      ).toBe(true);
    for (const candidate of research.candidates)
      for (const id of candidate.factIds)
        expect(supportedFact(id, now)).not.toBeNull();
    expect(
      research.sources.find((source) => source.id === "genc-300")?.kind,
    ).toBe("PUBLISHER");
    expect(
      research.sources.find((source) => source.id === "housing")?.kind,
    ).toBe("OFFICIAL");
  });
  it("çelişen ilan referansında kanonik URL kimliğini korur; imar iddiasını resmî alan yapmaz", () => {
    const candidate = research.candidates.find(
      (item) => item.id === "akgun-3653",
    )!;
    expect(researchListingInput(candidate, now)).toMatchObject({
      externalId: undefined,
      sourceUrl: candidate.sourceUrl,
      zoning: undefined,
      parcelNumber: undefined,
    });
  });
  it("demo ilan yatırım kararı almaz ve benzer görünümlü SUV farklı segmenti emsal olmaz", () => {
    const car: Evidence = {
      id: "real",
      title: "Kaynak araç",
      category: "ARABA",
      province: "Bursa",
      district: "Nilüfer",
      price: "1000000",
      isDemo: false,
      lastObservedAt: now,
      vehicle: {
        make: "Toyota",
        model: "RAV4",
        trim: "Dream",
        modelYear: 2022,
        mileage: 50000,
        fuel: "Hibrit",
        transmission: "Otomatik",
        damageHistory: "Beyan: kayıt yok",
        bodyType: "SUV",
        bodyTypeVerified: true,
        bodyTypeEvidence: "Kaynak gövde alanı",
      },
    };
    const others = Array.from({ length: 6 }, (_, i) => ({
      ...car,
      id: `other-${i}`,
      vehicle: { ...car.vehicle, model: "Corolla", bodyType: "SEDAN" },
    }));
    const result = listingDecision(
      car,
      others,
      "https://example.com/car",
      now,
    )!;
    expect(result.assessment?.sampleCount).toBe(0);
    expect(result.verdict).toBe("Yetersiz veri");
    expect(listingDecision({ ...car, isDemo: true }, [], null, now)).toBeNull();
  });
});
