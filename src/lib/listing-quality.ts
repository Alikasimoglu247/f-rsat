import type { StoredListing } from "./listings";
import { normalizeBodyType } from "./constants";
const known = (v: unknown) =>
  v != null &&
  v !== "" &&
  !["bilinmiyor", "unknown", "doğrulanmadı"].includes(
    String(v).trim().toLocaleLowerCase("tr-TR"),
  );
export function missingListingFields(l: StoredListing) {
  const missing: string[] = [];
  const check = (label: string, value: unknown) => {
    if (!known(value)) missing.push(label);
  };
  if (l.category === "ARABA") {
    const v = l.vehicle;
    for (const [label, value] of [
      ["Marka", v?.make],
      ["Model", v?.model],
      ["Donanım", v?.trim],
      ["Model yılı", v?.modelYear],
      ["Kilometre", v?.mileage],
      ["Yakıt", v?.fuel],
      ["Vites", v?.transmission],
      ["Hasar beyanı", v?.damageHistory],
    ])
      check(String(label), value);
    if (
      !normalizeBodyType(v?.bodyType) ||
      !v?.bodyTypeVerified ||
      !v.bodyTypeEvidence
    )
      missing.push("Kaynak kanıtı onaylı gövde tipi");
  } else {
    check("Mahalle", l.neighborhood);
    check("İşlem türü", l.transactionType);
    if (l.category === "EV") {
      const p = l.property;
      for (const [label, value] of [
        ["Net m²", p?.netM2],
        ["Brüt m²", p?.grossM2],
        ["Konut tipi", p?.propertyType],
        ["Oda", p?.rooms],
        ["Bina yaşı", p?.buildingAge],
        ["Durum", p?.condition],
      ])
        check(String(label), value);
      if (p?.netM2 && p.grossM2 && p.netM2.gt(p.grossM2))
        missing.push("Tutarlı net/brüt m²");
    } else {
      const p = l.land;
      for (const [label, value] of [
        ["Alan m²", p?.sizeM2],
        ["Arazi sınıfı", p?.classification],
        ["İmar beyanı", p?.zoning],
        ["Yol erişimi beyanı", p?.roadAccess],
        ["Hisse beyanı", p?.sharedOwnership],
      ])
        check(String(label), value);
    }
  }
  return missing;
}
export function comparableStatus(l: StoredListing, now = new Date()) {
  if (!l.assessment) return "NOT_ANALYZED";
  if (
    l.assessment.assessedAt < l.updatedAt ||
    now.getTime() - l.lastObservedAt.getTime() > 30 * 86400_000
  )
    return "OUTDATED";
  if (
    l.assessment.confidence === "INSUFFICIENT" ||
    l.assessment.sampleCount < 5
  )
    return "INSUFFICIENT";
  return "SUPPORTED";
}
