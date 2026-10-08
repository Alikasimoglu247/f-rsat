import { it, expect } from "vitest";
import { assess, comparablePrice } from "../../src/lib/analysis";
import type { Evidence } from "../../src/lib/analysis";
import { istanbulDayStart } from "../../src/lib/pilots";
const now = new Date("2026-10-08T06:00:00Z");
const home: Evidence = {
  id: "home",
  title: "Test Silivri konutu",
  category: "EV",
  province: "İstanbul",
  district: "Silivri",
  neighborhood: "Alibey",
  transactionType: "SATILIK",
  price: "100",
  isDemo: false,
  lastObservedAt: now,
  property: {
    netM2: "100",
    grossM2: "125",
    propertyType: "Daire",
    rooms: "2+1",
    buildingAge: 8,
    condition: "İyi",
  },
};
const suv: Evidence = {
  ...home,
  id: "suv",
  category: "ARABA",
  property: null,
  vehicle: {
    bodyType: "SUV",
    bodyTypeVerified: true,
    bodyTypeEvidence: "İncelenen test kaynak kanıtı",
    make: "Toyota",
    model: "RAV4",
    trim: "Dream",
    modelYear: 2022,
    mileage: 60000,
    fuel: "Hibrit",
    transmission: "Otomatik",
    damageHistory: "Beyan: kayıt yok",
  },
};
it("Silivri konutunda net alan üzerinden normalize eder; brüt alanı net yerine kullanmaz", () => {
  const other = {
    ...home,
    id: "other",
    price: "110",
    property: { ...home.property, netM2: "110", grossM2: "135" },
  };
  expect(comparablePrice(home, other, now)?.toFixed(2)).toBe("100.00");
});
it("Silivri'de farklı veya eksik mahalle, net/brüt alan ve kiralık kaydı dışlar", () => {
  for (const extra of [
    { neighborhood: "Selimpaşa" },
    { neighborhood: null },
    { transactionType: "KIRALIK" },
    { transactionType: null },
    { property: { ...home.property, netM2: null } },
    { property: { ...home.property, grossM2: null } },
    { property: { ...home.property, netM2: "150", grossM2: "125" } },
  ])
    expect(
      comparablePrice(home, { ...home, id: "other", ...extra }, now),
    ).toBeNull();
  expect(
    assess(
      { ...home, property: { ...home.property, netM2: null } },
      Array.from({ length: 8 }, (_, i) => ({ ...home, id: `c${i}` })),
      now,
    ).score,
  ).toBeNull();
});
it("oda ve bina yaşını aynı mahallede de eşleştirir", () => {
  for (const property of [
    { ...home.property, rooms: "3+1" },
    { ...home.property, buildingAge: 25 },
  ])
    expect(
      comparablePrice(home, { ...home, id: "other", property }, now),
    ).toBeNull();
});
it("Silivri arsa/tarlasında hisse, imar ve yol beyanlarını karıştırmaz", () => {
  const land: Evidence = {
    ...home,
    category: "ARSA",
    property: null,
    land: {
      sizeM2: "1000",
      classification: "Arsa",
      zoning: "Beyan: konut",
      roadAccess: "Beyan: yol var",
      sharedOwnership: "Beyan: müstakil",
    },
  };
  expect(
    comparablePrice(
      land,
      {
        ...land,
        id: "other",
        price: "110",
        land: { ...land.land, sizeM2: "1100" },
      },
      now,
    )?.toFixed(2),
  ).toBe("100.00");
  for (const l of [
    { ...land.land, sharedOwnership: "Beyan: hisseli" },
    { ...land.land, sharedOwnership: null },
    { ...land.land, zoning: null },
    { ...land.land, roadAccess: null },
  ])
    expect(
      comparablePrice(land, { ...land, id: "other", land: l }, now),
    ).toBeNull();
});
it("kanıtlı SUV emsallerini Marmara'nın farklı il ve ilçelerinde eşleştirir", () => {
  expect(
    comparablePrice(
      suv,
      { ...suv, id: "other", province: "Bursa", district: "Nilüfer" },
      now,
    )?.toString(),
  ).toBe("100");
  expect(
    comparablePrice(suv, { ...suv, id: "other", province: "Ankara" }, now),
  ).toBeNull();
});
it("belirsiz veya farklı gövde tipi ve kanıtsız onayı SUV emsali yapmaz", () => {
  for (const v of [
    { ...suv.vehicle, bodyType: "SEDAN" },
    { ...suv.vehicle, bodyType: "CROSSOVER" },
    { ...suv.vehicle, bodyTypeVerified: false },
    { ...suv.vehicle, bodyTypeEvidence: null },
    { ...suv.vehicle, bodyType: null },
  ])
    expect(
      comparablePrice(suv, { ...suv, id: "other", vehicle: v }, now),
    ).toBeNull();
});
it("SUV marka/model/donanım, yıl, kilometre ve hasar segmentlerini karıştırmaz", () => {
  for (const v of [
    { ...suv.vehicle, make: "BMW" },
    { ...suv.vehicle, model: "Corolla" },
    { ...suv.vehicle, trim: "Premium" },
    { ...suv.vehicle, modelYear: 2018 },
    { ...suv.vehicle, mileage: 160000 },
    { ...suv.vehicle, damageHistory: null },
  ])
    expect(
      comparablePrice(suv, { ...suv, id: "other", vehicle: v }, now),
    ).toBeNull();
});
it("bugün sayımını UTC gününe değil İstanbul gece yarısına göre başlatır", () => {
  expect(istanbulDayStart(new Date("2026-10-07T21:15:00Z")).toISOString()).toBe(
    "2026-10-07T21:00:00.000Z",
  );
});
