import { Prisma } from "@prisma/client";
import type { Category } from "./constants";
type D = Prisma.Decimal;
const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
export type Evidence = {
  id: string;
  title: string;
  category: Category;
  province: string;
  district: string;
  price: string;
  isDemo: boolean;
  lastObservedAt: Date | string;
  property?: {
    sizeM2?: string | null;
    propertyType?: string | null;
    rooms?: string | null;
    buildingAge?: number | null;
    condition?: string | null;
    legalStatus?: string | null;
    earthquakeInfo?: string | null;
  } | null;
  vehicle?: {
    make?: string | null;
    model?: string | null;
    trim?: string | null;
    modelYear?: number | null;
    mileage?: number | null;
    fuel?: string | null;
    transmission?: string | null;
    damageHistory?: string | null;
  } | null;
  land?: {
    sizeM2?: string | null;
    classification?: string | null;
    zoning?: string | null;
    roadAccess?: string | null;
    parcelNumber?: string | null;
    sharedOwnership?: string | null;
    agriculturalRestrictions?: string | null;
  } | null;
  prices?: { price: string; observedAt: Date | string }[];
};
export type RiskFlag = { code: string; label: string; verified: false };
export type Assessment = {
  medianPrice: string | null;
  rangeLow: string | null;
  rangeHigh: string | null;
  relativeDifference: string | null;
  priceChange: string | null;
  sampleCount: number;
  confidence: "HIGH" | "MEDIUM" | "INSUFFICIENT";
  score: number | null;
  riskFlags: RiskFlag[];
  explanation: string;
  comparables: { id: string; normalizedPrice: string; reason: string }[];
};
const norm = (value?: string | null) =>
  value?.normalize("NFC").trim().toLocaleLowerCase("tr-TR");
const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && norm(a) === norm(b);
const known = (value?: string | null) =>
  !!value && !["bilinmiyor", "unknown", "doğrulanmadı"].includes(norm(value)!);
export function quantile(values: D[], fraction: number): D {
  if (!values.length) throw new Error("Boş örneklem");
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const position = (sorted.length - 1) * fraction,
    lower = Math.floor(position);
  return sorted[lower].plus(
    sorted[Math.ceil(position)].minus(sorted[lower]).mul(position - lower),
  );
}
export function riskFlags(listing: Evidence): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const add = (code: string, label: string) =>
    flags.push({ code, label, verified: false });
  if (!listing.district || !listing.province)
    add("LOCATION", "Konum bilgisi eksik; yerinde doğrulama gerekli.");
  if (listing.category === "ARABA") {
    const v = listing.vehicle;
    if (!known(v?.damageHistory)) add("DAMAGE", "Hasar geçmişi doğrulanmamış.");
    if (v?.mileage == null) add("MILEAGE", "Kilometre bilgisi eksik.");
    if (
      !v?.make ||
      !v.model ||
      !v.trim ||
      !v.fuel ||
      !v.transmission ||
      v.modelYear == null
    )
      add("SPECS", "Araç özellikleri eksik; karşılaştırma sınırlı.");
    if (
      (v?.modelYear &&
        (v.modelYear > new Date().getUTCFullYear() + 1 ||
          v.modelYear < 1900)) ||
      (v?.mileage != null && v.mileage < 0)
    )
      add(
        "INCONSISTENT",
        "Araç bilgilerinde olası tutarsızlık var; doğrulama gerekli.",
      );
  } else if (listing.category === "EV") {
    const p = listing.property;
    if (
      !p?.sizeM2 ||
      !p.propertyType ||
      !p.rooms ||
      p.buildingAge == null ||
      !p.condition
    )
      add("BUILDING", "Bina/konut bilgileri eksik.");
    if (!known(p?.legalStatus))
      add("LEGAL", "Tapu ve hukuki durum doğrulanmamış.");
    if (!known(p?.earthquakeInfo))
      add("EARTHQUAKE", "Deprem dayanımı hakkında doğrulanmış veri yok.");
  } else {
    const l = listing.land;
    if (!known(l?.zoning))
      add("ZONING", "İmar durumu bilinmiyor veya doğrulanmamış.");
    if (
      !known(l?.sharedOwnership) ||
      norm(l?.sharedOwnership)?.includes("hisseli")
    )
      add("OWNERSHIP", "Hisse/mülkiyet durumu için belge doğrulaması gerekli.");
    if (!known(l?.roadAccess)) add("ROAD", "Yol erişimi doğrulanmamış.");
    if (!l?.parcelNumber) add("CADASTRE", "Ada/parsel bilgisi eksik.");
    if (listing.category === "TARLA" && !known(l?.agriculturalRestrictions))
      add("AGRICULTURE", "Tarımsal kullanım kısıtları doğrulanmamış.");
  }
  return flags;
}
export function comparablePrice(
  subject: Evidence,
  candidate: Evidence,
  now = new Date(),
): D | null {
  if (
    subject.id === candidate.id ||
    subject.category !== candidate.category ||
    subject.isDemo !== candidate.isDemo ||
    !same(subject.province, candidate.province) ||
    !same(subject.district, candidate.district)
  )
    return null;
  const age = now.getTime() - new Date(candidate.lastObservedAt).getTime();
  if (!Number.isFinite(age) || age < -60_000 || age > 30 * 86400_000)
    return null;
  if (subject.category === "ARABA") {
    const a = subject.vehicle,
      b = candidate.vehicle;
    if (
      !a ||
      !b ||
      !same(a.make, b.make) ||
      !same(a.model, b.model) ||
      !same(a.trim, b.trim) ||
      !same(a.fuel, b.fuel) ||
      !same(a.transmission, b.transmission) ||
      !known(a.damageHistory) ||
      !same(a.damageHistory, b.damageHistory) ||
      a.modelYear == null ||
      b.modelYear == null ||
      Math.abs(a.modelYear - b.modelYear) > 1 ||
      a.mileage == null ||
      b.mileage == null ||
      Math.abs(a.mileage - b.mileage) > Math.max(20_000, a.mileage * 0.2)
    )
      return null;
    return decimal(candidate.price);
  }
  const a = subject.category === "EV" ? subject.property : subject.land;
  const b = candidate.category === "EV" ? candidate.property : candidate.land;
  if (
    !a?.sizeM2 ||
    !b?.sizeM2 ||
    decimal(a.sizeM2).lte(0) ||
    decimal(b.sizeM2).lte(0)
  )
    return null;
  const ratio = decimal(b.sizeM2).div(a.sizeM2);
  if (ratio.lt(0.75) || ratio.gt(1.25)) return null;
  if (subject.category === "EV") {
    const p = subject.property!,
      q = candidate.property!;
    if (
      !same(p.propertyType, q.propertyType) ||
      !same(p.rooms, q.rooms) ||
      !same(p.condition, q.condition) ||
      p.buildingAge == null ||
      q.buildingAge == null ||
      Math.abs(p.buildingAge - q.buildingAge) > 5
    )
      return null;
  } else {
    const p = subject.land!,
      q = candidate.land!;
    if (
      !same(p.classification, q.classification) ||
      !known(p.zoning) ||
      !same(p.zoning, q.zoning) ||
      !known(p.roadAccess) ||
      !same(p.roadAccess, q.roadAccess)
    )
      return null;
  }
  return decimal(candidate.price).div(b.sizeM2).mul(a.sizeM2);
}
export function assess(
  subject: Evidence,
  candidates: Evidence[],
  now = new Date(),
): Assessment {
  const risks = riskFlags(subject);
  const history = [...(subject.prices ?? [])].sort(
    (a, b) =>
      new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
  );
  const first = history[0]?.price;
  const priceChange =
    history.length > 1 && first && decimal(first).gt(0)
      ? decimal(subject.price).minus(first).div(first).mul(100).toFixed(4)
      : null;
  let matching = candidates.flatMap((candidate) => {
    const price = comparablePrice(subject, candidate, now);
    return price && price.gt(0) ? [{ id: candidate.id, price }] : [];
  });
  if (matching.length >= 5) {
    const prices = matching.map((item) => item.price),
      q1 = quantile(prices, 0.25),
      q3 = quantile(prices, 0.75),
      iqr = q3.minus(q1);
    const low = q1.minus(iqr.mul(1.5)),
      high = q3.plus(iqr.mul(1.5));
    matching = matching.filter(
      (item) => item.price.gte(low) && item.price.lte(high),
    );
  }
  const base = {
    priceChange,
    sampleCount: matching.length,
    riskFlags: risks,
    comparables: matching.map((item) => ({
      id: item.id,
      normalizedPrice: item.price.toFixed(2),
      reason:
        subject.category === "ARABA"
          ? "Aynı il/ilçe, marka/model/donanım, benzer yıl/km ve aynı beyan edilen hasar bilgisi."
          : "Aynı il/ilçe ve tür; benzer özellikler. Alan farkı m² üzerinden normalleştirildi.",
    })),
  };
  const subjectAge = now.getTime() - new Date(subject.lastObservedAt).getTime();
  if (
    matching.length < 5 ||
    !Number.isFinite(subjectAge) ||
    subjectAge > 30 * 86400_000 ||
    subjectAge < -60_000
  )
    return {
      ...base,
      medianPrice: null,
      rangeLow: null,
      rangeHigh: null,
      relativeDifference: null,
      confidence: "INSUFFICIENT",
      score: null,
      explanation:
        "Güncel ve yeterince benzer en az 5 emsal gerekli. Kanıt yetersiz olduğu için değerleme ve fırsat puanı üretilmedi.",
    };
  const prices = matching.map((item) => item.price),
    median = quantile(prices, 0.5);
  const difference = median.minus(subject.price).div(median).mul(100);
  if (difference.gt(40))
    risks.push({
      code: "LOW_PRICE",
      label:
        "İstenen fiyat emsal medyanından çok düşük; veri ve ilan doğrulaması gerekli.",
      verified: false,
    });
  const score = Math.round(
    Math.max(
      0,
      Math.min(100, 50 + difference.toNumber() * 1.7 - risks.length * 4),
    ),
  );
  const confidence =
    matching.length >= 8 ? ("HIGH" as const) : ("MEDIUM" as const);
  return {
    ...base,
    medianPrice: median.toFixed(2),
    rangeLow: quantile(prices, 0.25).toFixed(2),
    rangeHigh: quantile(prices, 0.75).toFixed(2),
    relativeDifference: difference.toFixed(4),
    confidence,
    score,
    explanation: `${matching.length} benzer ilanın istenen fiyatları karşılaştırıldı. Bu ilan emsal medyanının %${difference.abs().toFixed(1)} ${difference.gte(0) ? "altında" : "üzerinde"}. ${risks.length} doğrulama uyarısı var. Bu sonuç satış fiyatı, ekspertiz veya yatırım tavsiyesi değildir.${subject.isDemo ? " Yalnızca demo veriler kullanıldı." : ""}`,
  };
}
