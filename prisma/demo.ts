import type { ListingInput } from "../src/lib/validation";
export function demoListings(): ListingInput[] {
  const records: ListingInput[] = [];
  for (let index = 0; index < 9; index++) {
    records.push({
      title: `[DEMO] Kadıköy 2+1 daire ${index + 1}`,
      category: "EV",
      province: "İstanbul",
      district: "Kadıköy",
      neighborhood: "Demo Mahallesi",
      price: String(index === 0 ? 4250000 : 5550000 + index * 90000),
      externalId: `demo-ev-${index}`,
      isDemo: true,
      sizeM2: String(95 + index),
      propertyType: "Daire",
      rooms: "2+1",
      buildingAge: 10 + (index % 3),
      condition: "İyi",
      legalStatus: "Doğrulanmadı",
      earthquakeInfo: "Doğrulanmadı",
    });
    records.push({
      title: `[DEMO] Toyota Corolla 1.5 Dream ${index + 1}`,
      category: "ARABA",
      province: "Bursa",
      district: "Nilüfer",
      price: String(index === 0 ? 920000 : 1200000 + index * 15000),
      externalId: `demo-araba-${index}`,
      isDemo: true,
      make: "Toyota",
      model: "Corolla",
      trim: "1.5 Dream",
      modelYear: 2021 + (index % 2),
      mileage: 60000 + index * 1000,
      fuel: "Benzin",
      transmission: "Otomatik",
      damageHistory: "Kullanıcı beyanı: kayıt yok (doğrulanmadı)",
    });
    records.push({
      title: `[DEMO] Çorlu konut imarlı arsa ${index + 1}`,
      category: "ARSA",
      province: "Tekirdağ",
      district: "Çorlu",
      price: String(index === 0 ? 1400000 : 1850000 + index * 35000),
      externalId: `demo-arsa-${index}`,
      isDemo: true,
      sizeM2: String(480 + index * 5),
      classification: "Arsa",
      zoning: "Kullanıcı beyanı: konut imarlı",
      roadAccess: "Kullanıcı beyanı: yol var",
      parcelNumber: `DEMO-${100 + index}/1`,
      sharedOwnership: "Doğrulanmadı",
    });
    records.push({
      title: `[DEMO] Gönen tarımsal arazi ${index + 1}`,
      category: "TARLA",
      province: "Balıkesir",
      district: "Gönen",
      price: String(index === 0 ? 650000 : 950000 + index * 20000),
      externalId: `demo-tarla-${index}`,
      isDemo: true,
      sizeM2: String(4900 + index * 50),
      classification: "Tarla",
      zoning: "Kullanıcı beyanı: tarımsal",
      roadAccess: "Kullanıcı beyanı: yol var",
      parcelNumber: `DEMO-${200 + index}/2`,
      sharedOwnership: "Doğrulanmadı",
      agriculturalRestrictions: "Doğrulanmadı",
    });
  }
  return records;
}
