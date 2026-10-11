import { expect, it } from "vitest";
import { comparisonWarnings } from "../../src/lib/comparison";
import type { Evidence } from "../../src/lib/analysis";
const base: Evidence = {
  id: "a",
  title: "SENTETİK",
  category: "ARSA",
  province: "İstanbul",
  district: "Silivri",
  neighborhood: "Değirmenköy",
  price: "440000",
  isDemo: false,
  lastObservedAt: new Date(),
};
it("arsa ve tarla ile farklı SUV modellerini fiyat emsali kabul etmez", () => {
  expect(
    comparisonWarnings(
      [base, { ...base, id: "b", category: "TARLA" }],
      [],
    ).join(" "),
  ).toContain("Farklı kategoriler");
  const suv = {
    ...base,
    category: "ARABA" as const,
    vehicle: {
      make: "BMW",
      model: "X3",
      bodyType: "SUV",
      bodyTypeVerified: true,
      bodyTypeEvidence: "SENTETİK",
    },
  };
  expect(
    comparisonWarnings(
      [suv, { ...suv, id: "b", vehicle: { ...suv.vehicle, model: "X5" } }],
      [],
    ).join(" "),
  ).toContain("Bu araçlar fiyat emsali değildir");
});
it("aynı parsel ve yetersiz bağımsız emsali açıklar", () => {
  expect(
    comparisonWarnings(
      [
        { ...base, land: { parcelNumber: "344/95" } },
        { ...base, id: "b", land: { parcelNumber: "344/95" } },
      ],
      [],
    ).join(" "),
  ).toContain("mükerrer emsal");
  expect(comparisonWarnings([base], []).join(" ")).toContain(
    "fiyat avantajı puanı üretilmez",
  );
});
