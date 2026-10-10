import { Prisma } from "@prisma/client";
import snapshot from "@/data/silivri-research.json";
import { assess, type Assessment, type Evidence } from "./analysis";
import { normalizeFuel, money } from "./constants";

export type ResearchEvidenceField =
  | "classification"
  | "zoning"
  | "sharedOwnership"
  | "roadAccess"
  | "parcelNumber"
  | "agriculturalRestrictions"
  | "legalStatus"
  | "earthquakeInfo"
  | "availability"
  | "demand"
  | "liquidity"
  | "opportunityCost"
  | "vehicleCondition"
  | "batteryHealth"
  | "warranty"
  | "operatingCosts";
export type ResearchSource = {
  id: string;
  name: string;
  url: string;
  retrievedAt: string;
  kind: string;
  validForDays: number;
  sha256: string;
  usageNote: string;
  // A failed current check invalidates an earlier successful observation.
  checkStatus?: string;
};
export type ResearchFact = {
  id: string;
  sourceId: string;
  label: string;
  value: number | null;
  unit: string | null;
  period: string | null;
  scope: string;
  subjectId?: string;
  field?: ResearchEvidenceField;
  text?: string;
  validUntil?: string;
  superseded?: boolean;
};
export type ResearchCandidate = {
  id: string;
  sourceId: string;
  externalId: string | null;
  sourceUrl: string;
  publishedAt: string | null;
  observedAt: string;
  title: string;
  category: string;
  province: string;
  district: string;
  neighborhood: string;
  transactionType: string;
  price: string | null;
  netM2: string | null;
  grossM2: string | null;
  propertyType: string | null;
  rooms: string | null;
  buildingAge: number | null;
  condition: string | null;
  legalStatus: string | null;
  earthquakeInfo: string | null;
  mortgageEligible: boolean | null;
  factIds: string[];
  features: string[];
  limitations: string[];
  sizeM2: string | null;
  classification: string | null;
  zoning: string | null;
  roadAccess: string | null;
  parcelNumber: string | null;
  sharedOwnership: string | null;
  agriculturalRestrictions: string | null;
  riskSignals: string[];
  areaBasis: string | null;
  externalReferenceConflict?: boolean;
  identityReviewRequired?: boolean;
  reviewReasons?: string[];
  evidence?: Partial<Record<ResearchEvidenceField, string[]>>;
  vehicle?: Evidence["vehicle"];
};
export type ResearchSnapshot = Omit<
  typeof snapshot,
  "sources" | "facts" | "candidates"
> & {
  sources: ResearchSource[];
  facts: ResearchFact[];
  candidates: ResearchCandidate[];
};
export type Verdict = "İncelemeye değer" | "Riskli" | "Yetersiz veri";
export type Reason = {
  text: string;
  evidenceIds: string[];
  kind: "INFERENCE" | "PUBLISHER";
};
export type Decision = {
  id: string;
  title: string;
  category: Evidence["category"];
  location: string;
  sourceUrl: string | null;
  observedAt: string;
  price: string | null;
  verdict: Verdict;
  whyCould: Reason[];
  whyNot: Reason[];
  missing: string[];
  alternatives: string;
  factIds: string[];
  assessment: Assessment | null;
  features: string[];
  origin: "RESEARCH" | "DATABASE";
  unitPrice: string | null;
  publishedAt: string | null;
  priceCurrent?: boolean;
};

export const research: ResearchSnapshot = snapshot;
const day = 86_400_000;
export function observedUnitPrice(price: string | null, area: string | null) {
  if (
    !price ||
    !area ||
    !/^\d{1,16}(\.\d{1,2})?$/.test(price) ||
    !/^\d{1,10}(\.\d{1,2})?$/.test(area)
  )
    return null;
  const amount = new Prisma.Decimal(price),
    size = new Prisma.Decimal(area);
  return amount.gt(0) && size.gt(0) ? amount.div(size).toFixed(2) : null;
}
export function researchUrlAllowed(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname !== "sahibinden.com" &&
      !url.hostname.endsWith(".sahibinden.com")
    );
  } catch {
    return false;
  }
}
export function sourceFresh(source: ResearchSource, now = new Date()) {
  const age = now.getTime() - new Date(source.retrievedAt).getTime();
  return (
    researchUrlAllowed(source.url) &&
    (!source.checkStatus ||
      ["VALID", "UNCHANGED"].includes(source.checkStatus)) &&
    /^[a-f0-9]{64}$/.test(source.sha256) &&
    Number.isFinite(source.validForDays) &&
    source.validForDays > 0 &&
    Number.isFinite(age) &&
    age >= -60_000 &&
    age <= source.validForDays * day
  );
}
export function supportedFact(
  id: string,
  now = new Date(),
  data: ResearchSnapshot = research,
) {
  const fact = data.facts.find((item) => item.id === id);
  const source = data.sources.find((item) => item.id === fact?.sourceId);
  const validUntil = fact?.validUntil
    ? new Date(fact.validUntil).getTime()
    : Infinity;
  return fact &&
    !fact.superseded &&
    source &&
    sourceFresh(source, now) &&
    validUntil >= now.getTime()
    ? fact
    : null;
}
// Compare identical observation periods; September CPI cannot deflate August housing.
export function realAnnualChange(
  nominal: ResearchFact | null,
  inflation: ResearchFact | null,
) {
  if (
    !nominal ||
    !inflation ||
    !nominal.period ||
    nominal.period !== inflation.period ||
    nominal.value == null ||
    inflation.value == null ||
    nominal.unit !== "%" ||
    inflation.unit !== "%" ||
    !Number.isFinite(nominal.value) ||
    !Number.isFinite(inflation.value) ||
    inflation.value <= -100
  )
    return null;
  return new Prisma.Decimal(nominal.value)
    .div(100)
    .plus(1)
    .div(new Prisma.Decimal(inflation.value).div(100).plus(1))
    .minus(1)
    .mul(100)
    .toFixed(2);
}

const unknownValues = new Set([
  "bilgi yok",
  "bilinmiyor",
  "unknown",
  "doğrulanmadı",
  "yok",
  "nan",
]);
const normalized = (value: string) =>
  value.normalize("NFC").trim().toLocaleLowerCase("tr-TR");
const known = (value: string | null | undefined) =>
  !!value?.trim() && !unknownValues.has(normalized(value));

export function researchCandidateFresh(
  candidate: ResearchCandidate,
  now = new Date(),
  data: ResearchSnapshot = research,
) {
  const source = data.sources.find((item) => item.id === candidate.sourceId);
  return (
    !!source &&
    source.url === candidate.sourceUrl &&
    source.retrievedAt === candidate.observedAt &&
    sourceFresh(source, now)
  );
}

// A district-wide official report does not verify the legal status of a parcel.
// Each verification must name this candidate and field, and match its stated value.
export function verifiedResearchField(
  candidate: ResearchCandidate,
  field: ResearchEvidenceField,
  now = new Date(),
  data: ResearchSnapshot = research,
) {
  return (candidate.evidence?.[field] ?? []).some((id) => {
    const fact = supportedFact(id, now, data);
    if (
      !fact ||
      fact.subjectId !== candidate.id ||
      fact.field !== field ||
      !known(fact.text)
    )
      return false;
    const source = data.sources.find((item) => item.id === fact.sourceId);
    if (field === "availability")
      return (
        !!source &&
        ["OFFICIAL", "PUBLISHER"].includes(source.kind) &&
        ["active", "satılık", "satilik", "mevcut"].includes(
          normalized(fact.text!),
        )
      );
    if (source?.kind !== "OFFICIAL") return false;
    if (
      [
        "demand",
        "liquidity",
        "opportunityCost",
        "vehicleCondition",
        "batteryHealth",
        "warranty",
        "operatingCosts",
      ].includes(field)
    )
      return true;
    const value = candidate[field as keyof ResearchCandidate];
    return (
      typeof value === "string" &&
      known(value) &&
      normalized(value) === normalized(fact.text!)
    );
  });
}

export function candidateLegalVerified(
  candidate: ResearchCandidate,
  now = new Date(),
  data: ResearchSnapshot = research,
) {
  if (
    candidate.identityReviewRequired ||
    !researchCandidateFresh(candidate, now, data)
  )
    return false;
  if (candidate.category === "ARABA")
    return (
      !!candidate.vehicle?.bodyTypeVerified &&
      known(candidate.vehicle.bodyTypeEvidence)
    );
  const fields: ResearchEvidenceField[] =
    candidate.category === "EV"
      ? ["legalStatus", "earthquakeInfo"]
      : [
          "classification",
          "zoning",
          "sharedOwnership",
          "roadAccess",
          "parcelNumber",
        ];
  return fields.every((field) =>
    verifiedResearchField(candidate, field, now, data),
  );
}

function currentAlternativeResearch(
  candidate: ResearchCandidate,
  now: Date,
  data: ResearchSnapshot,
) {
  const area = candidate.category === "EV" ? candidate.netM2 : candidate.sizeM2;
  if (!observedUnitPrice("1", area)) return [];
  return data.candidates
    .filter((other) => {
      const otherArea = other.category === "EV" ? other.netM2 : other.sizeM2;
      if (
        other.sourceUrl === candidate.sourceUrl ||
        other.identityReviewRequired ||
        other.category !== candidate.category ||
        normalized(other.province) !== normalized(candidate.province) ||
        normalized(other.district) !== normalized(candidate.district) ||
        normalized(other.neighborhood) !== normalized(candidate.neighborhood) ||
        !researchCandidateFresh(other, now, data) ||
        !observedUnitPrice(other.price, otherArea)
      )
        return false;
      const relative = new Prisma.Decimal(otherArea!).div(area!);
      return relative.gte("0.7") && relative.lte("1.3");
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function researchDecision(
  candidate: ResearchCandidate,
  now = new Date(),
  assessment: Assessment | null = null,
  data: ResearchSnapshot = research,
): Decision {
  const current = researchCandidateFresh(candidate, now, data);
  const alternativeResearch = current
    ? currentAlternativeResearch(candidate, now, data)
    : [];
  const alternativeNote =
    current && ["ARSA", "TARLA", "EV"].includes(candidate.category)
      ? ` Güncel araştırma grubunda aynı mahalle/tür ve yaklaşık alan aralığında ${alternativeResearch.length} başka fiyatlı aday bulundu.${
          alternativeResearch.length
            ? ` Araştırılan örnekler: ${alternativeResearch
                .slice(0, 3)
                .map(
                  (item) =>
                    `${item.title} (${item.price} TL, ${item.sizeM2 ?? item.netM2} m²)`,
                )
                .join("; ")}.`
            : ""
        } Hukuki nitelikler ve satış mevcudiyeti doğrulanmadığı için bu adaylar emsal veya daha iyi yatırım diye sıralanmadı.`
      : "";
  const verified = (field: ResearchEvidenceField) =>
    current && verifiedResearchField(candidate, field, now, data);
  const price =
    current && observedUnitPrice(candidate.price, "1") ? candidate.price : null;
  const candidateArea =
    candidate.category === "EV" ? candidate.netM2 : candidate.sizeM2;
  const area =
    current && observedUnitPrice("1", candidateArea) ? candidateArea : null;
  const missing: string[] = [];
  if (candidate.identityReviewRequired)
    missing.push(
      "İlan kimliği/fiyat çelişkisi için inceleme ve veritabanı uzlaştırması",
    );
  if (!current)
    missing.push(
      "Güncel kaynak kontrolü: araştırma gözlemi eskidi veya geçersiz",
    );
  if (!price) missing.push("Güncel TL satış fiyatı");
  if (!known(candidate.neighborhood))
    missing.push("Karşılaştırma için doğrulanabilir mahalle");
  if (candidate.category === "EV") {
    if (
      !observedUnitPrice("1", candidate.netM2) ||
      !observedUnitPrice("1", candidate.grossM2) ||
      (candidate.netM2 &&
        candidate.grossM2 &&
        new Prisma.Decimal(candidate.grossM2).lt(candidate.netM2))
    )
      missing.push("Ayrı net/brüt m²");
    if (!known(candidate.rooms) || !known(candidate.propertyType))
      missing.push("Oda sayısı ve bağımsız bölüm");
    if (candidate.buildingAge == null || !known(candidate.condition))
      missing.push("Bina yaşı ve kullanım durumu");
    if (!verified("legalStatus")) missing.push("Tapu, iskân ve teslim durumu");
    if (!verified("earthquakeInfo")) missing.push("Bina/zemin dayanımı");
    missing.push("Gerçek kira, aidat ve boşluk süresi");
  } else if (candidate.category === "ARABA") {
    if (
      !candidate.vehicle?.bodyTypeVerified ||
      !known(candidate.vehicle.bodyTypeEvidence)
    )
      missing.push("Kaynak kanıtıyla doğrulanmış gövde tipi");
    for (const [label, value] of [
      ["Marka", candidate.vehicle?.make],
      ["Model", candidate.vehicle?.model],
      ["Donanım", candidate.vehicle?.trim],
      ["Yakıt", candidate.vehicle?.fuel],
      ["Şanzıman", candidate.vehicle?.transmission],
      ["Doğrulanmış hasar geçmişi", candidate.vehicle?.damageHistory],
    ] as const)
      if (!known(value)) missing.push(label);
    if (candidate.vehicle?.modelYear == null) missing.push("Model yılı");
    if (candidate.vehicle?.mileage == null) missing.push("Kilometre");
    if (!verified("vehicleCondition"))
      missing.push("Bağımsız ekspertiz ve kondisyon teyidi");
    if (!verified("warranty"))
      missing.push("Geçerli garanti kapsamı ve süresi");
    if (!verified("operatingCosts"))
      missing.push("Bakım, sigorta, vergi ve kullanım maliyetleri");
    if (
      ["elektrik", "hibrit"].includes(
        normalizeFuel(candidate.vehicle?.fuel) ?? "",
      ) &&
      !verified("batteryHealth")
    )
      missing.push("Batarya sağlık raporu ve batarya garanti kapsamı");
  } else {
    if (!area) missing.push("Geçerli parsel alanı (m²)");
    if (!verified("zoning") || !verified("classification"))
      missing.push("Güncel resmî imar ve arazi sınıfı");
    if (!verified("sharedOwnership") || !verified("legalStatus"))
      missing.push("Tapu/pay ve takyidat belgeleri");
    if (!verified("roadAccess")) missing.push("Belgeli yasal yol erişimi");
    if (!known(candidate.parcelNumber))
      missing.push("Sayısal ada/parsel kimliği");
    else if (!verified("parcelNumber"))
      missing.push("Parsel kimliği ile konumun belge eşleşmesi");
    if (candidate.category === "TARLA" && !verified("agriculturalRestrictions"))
      missing.push("Tarımsal kullanım kısıtları ve gelir/gider");
  }
  if (!verified("availability"))
    missing.push("Güncel satış mevcudiyeti ve fiyat teyidi");
  if (!verified("demand"))
    missing.push("Aynı segment için belgeli talep göstergesi");
  if (!verified("liquidity")) missing.push("Satış süresi ve likidite kanıtı");
  if (!verified("opportunityCost"))
    missing.push("Net alternatif yatırım ve finansman maliyeti");
  const currentAssessment = current ? assessment : null;
  const parcelReasons: Reason[] = [];
  if (current && ["ARSA", "TARLA"].includes(candidate.category)) {
    const offerIds = candidate.factIds.filter((id) =>
      supportedFact(id, now, data),
    );
    const unit = observedUnitPrice(price, area);
    const identity = candidate.parcelNumber
      ? `${candidate.parcelNumber} ada/parsel`
      : "Ada/parseli açıklanmayan taşınmaz";
    const comparableReady =
      candidateLegalVerified(candidate, now, data) &&
      currentAssessment?.score != null &&
      currentAssessment.sampleCount >= 5;
    if (price && area && unit)
      parcelReasons.push({
        text: `${identity}: ${price} TL / ${area} m² = ${unit} TL/m² isteniyor. ${comparableReady ? `Mevcut fiyat motoru ${currentAssessment!.sampleCount} eşleşen kaydı değerlendirdi; yatırım sonucu finansman, likidite ve diğer eksik kanıtlarla birlikte okunmalıdır.` : "Bu taşınmazın fiyat avantajı hesaplanamadı: en az 5 güncel, bağımsız ve aynı hukuki sınıftaki emsal doğrulanmadı."} İstenen fiyat, gerçekleşmiş satış bedeli değildir.`,
        evidenceIds: offerIds.slice(0, 1),
        kind: "INFERENCE",
      });
    if (
      known(candidate.sharedOwnership) &&
      normalized(candidate.sharedOwnership!).includes("hisseli")
    )
      parcelReasons.push({
        text: `${identity} için yayıncı tapuyu hisseli olarak belirtiyor. ${area ?? "Açıklanmayan"} m²'nin tapudaki paya mı, ana parsel alanına mı, kullanım bölümüne mi karşılık geldiği doğrulanmadı. ${price ?? "Açıklanmayan"} TL bedelin satın aldığı pay/payda ve takyidat bilinmeden bağımsız parsel veya yeniden satış avantajı kabul edilemez.`,
        evidenceIds: offerIds.slice(0, 1),
        kind: "INFERENCE",
      });
    if (
      /asfalta yakın|imara yakın|yerleşim yerinin yanında/u.test(
        normalized(candidate.title),
      )
    )
      parcelReasons.push({
        text: `“${candidate.title}” başlığındaki yakınlık beyanı; imar hakkı, onaylı plan veya belgeli yasal yol cephesi sağlamaz. Bu özellikler doğrulanmadan fiyatın haklı bir prim mi yoksa risk karşılığı mı olduğu bilinmez.`,
        evidenceIds: offerIds.slice(0, 1),
        kind: "INFERENCE",
      });
    if (
      candidate.publishedAt &&
      /^\d{4}-\d{2}-\d{2}$/.test(candidate.publishedAt)
    ) {
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Istanbul",
      }).format(now);
      const days = Math.floor(
        (Date.parse(localDate) - Date.parse(candidate.publishedAt)) / day,
      );
      if (Number.isFinite(days) && days > 90)
        parcelReasons.push({
          text: `Kaynak ilan tarihi ${candidate.publishedAt}; değerlendirme tarihinden ${days} gün önce. Bu, kesintisiz satışta kalma süresi değildir. Bugün sayfada aynı fiyatın okunması yeni ilan veya satılmamış güncel stok kanıtı sayılmaz; likidite çıkarımı yapılamadı.`,
          evidenceIds: offerIds.slice(0, 1),
          kind: "INFERENCE",
        });
    }
    const division = supportedFact("genc-private-division", now, data);
    if (division && candidate.sourceId.startsWith("genc-"))
      parcelReasons.push({
        text: "Aynı yayıncının Değirmenköy duyurusunda özel parselasyon ve hisseli arsalar anlatılıyor. Duyuru bu ada/parselin tapu belgesi değildir; “tamamı” ifadesinden ayrı ve müstakil tapu sonucu çıkarılamaz. Duyuru tarihsiz olduğu için kampanya fiyatı değerlendirmeye alınmadı.",
        evidenceIds: [division.id, ...offerIds.slice(0, 1)],
        kind: "INFERENCE",
      });
  }
  if (
    !currentAssessment ||
    currentAssessment.score == null ||
    currentAssessment.sampleCount < 5
  )
    missing.push("En az 5 güncel, aynı nitelikte gerçek emsal");
  for (const flag of currentAssessment?.riskFlags ?? [])
    if (!missing.includes(flag.label)) missing.push(flag.label);
  const factIds = current
    ? candidate.factIds.filter((id) => supportedFact(id, now, data))
    : [];
  const officialFact = (id: string) => {
    const fact = supportedFact(id, now, data);
    return fact &&
      data.sources.some(
        (source) => source.id === fact.sourceId && source.kind === "OFFICIAL",
      )
      ? fact
      : null;
  };
  const policy = officialFact("policy-rate");
  const rail =
    candidate.category === "ARABA" ? null : officialFact("rail-stage");
  const housing =
    candidate.category === "ARABA" ? null : officialFact("housing-istanbul");
  const inflation =
    housing &&
    data.facts.find(
      (fact) =>
        fact.id.startsWith("cpi-") &&
        fact.period === housing.period &&
        fact.unit === "%" &&
        fact.scope === "Türkiye" &&
        officialFact(fact.id),
    );
  const realHousing = realAnnualChange(housing, inflation ?? null);
  const economicReason: Reason[] =
    policy && policy.value != null && Number.isFinite(policy.value)
      ? [
          {
            text: `TCMB politika faizi %${policy.value} (${policy.period ?? "dönem belirtilmedi"}). Bu, kredi veya mevduat teklifi değildir; finansman maliyeti ve sermayenin alternatif kullanım getirisi gerçek banka koşullarıyla karşılaştırılmadan yatırım kazancı hesaplanamaz.`,
            evidenceIds: [policy.id],
            kind: "INFERENCE",
          },
        ]
      : [];
  if (realHousing && new Prisma.Decimal(realHousing).lt(0))
    economicReason.push({
      text: `İstanbul konut endeksinin ${housing!.period} döneminde aynı dönem TÜFE ile hesaplanan reel yıllık değişimi %${realHousing}. Bu ilçe/mahalle veya arsa değerlemesi değildir; nominal fiyat artışı tek başına reel kazanç göstermez.`,
      evidenceIds: [housing!.id, inflation!.id],
      kind: "INFERENCE",
    });
  const risks = current ? [...candidate.riskSignals] : [];
  if (
    current &&
    normalized(candidate.sharedOwnership ?? "").includes("hisseli") &&
    !risks.length
  )
    risks.push(
      "Hisseli tapu beyanı: pay ve kullanım hakkı resmî belge olmadan bağımsız mülkiyet sayılmaz.",
    );
  const enough =
    current && missing.length === 0 && currentAssessment?.score != null;
  const verdict: Verdict = candidate.identityReviewRequired
    ? "Yetersiz veri"
    : risks.length
      ? "Riskli"
      : !enough
        ? "Yetersiz veri"
        : currentAssessment!.score! >= 70
          ? "İncelemeye değer"
          : "Riskli";
  return {
    id: candidate.id,
    title: candidate.title,
    category: candidate.category as Evidence["category"],
    location: `${candidate.province} / ${candidate.district} / ${candidate.neighborhood}`,
    sourceUrl: researchUrlAllowed(candidate.sourceUrl)
      ? candidate.sourceUrl
      : null,
    observedAt: candidate.observedAt,
    publishedAt: candidate.publishedAt,
    // Keep the dated observation visible; it cannot support current valuation.
    price: observedUnitPrice(candidate.price, "1") ? candidate.price : null,
    priceCurrent: !!price,
    unitPrice: observedUnitPrice(price, area),
    verdict,
    origin: "RESEARCH",
    whyCould:
      current && factIds.length
        ? [
            {
              text:
                candidate.category === "EV"
                  ? "Yayıncının konut özellikleri kullanım ihtiyacına uyabilir. Aynı mahallede aynı tür/net-brüt alan, oda ve yaştaki konutların fiyatı ve gerçek kira kanıtı tamamlanmadan yatırım avantajı bilinmez."
                  : candidate.category === "ARABA"
                    ? "Doğrulanmış gövde tipi ile aynı marka/model/donanım, benzer yıl/km ve hasar durumundaki araçlar araştırılabilir; farklı segment SUV'lar doğrudan emsal değildir."
                    : `Güncel kaynak beyanı ${price ?? "bilinmeyen"} TL / ${area ?? "bilinmeyen"} m²: ilk bütçe/kullanım elemesine olanak veriyor. Mahalle, imar, hisse ve yasal yol eşleşmesi doğrulanmadan düşük bedel tek başına fırsat değildir.`,
              evidenceIds: [factIds[0]],
              kind: "INFERENCE",
            },
            ...(rail
              ? [
                  {
                    text: `${rail.label}. Bölgesel ulaşım araştırma gerekçesidir; bu adayın istasyona erişimi, tamamlanmış hizmet veya değer artışı ayrıca doğrulanmalıdır.`,
                    evidenceIds: [rail.id],
                    kind: "INFERENCE" as const,
                  },
                ]
              : []),
          ]
        : [],
    whyNot: [
      ...parcelReasons,
      ...(current &&
      candidate.category === "ARABA" &&
      candidate.vehicle &&
      price
        ? [
            {
              text: `${candidate.vehicle.make} ${candidate.vehicle.model} ${candidate.vehicle.trim ?? ""}: yayıncı ${candidate.vehicle.modelYear} model, ${candidate.vehicle.mileage?.toLocaleString("tr-TR")} km ve ${money(price)} istiyor. ${currentAssessment?.score != null && currentAssessment.sampleCount >= 5 ? `Karşılaştırma ${currentAssessment.sampleCount} aynı segmentte fiyat beyanına dayanır; gerçekleşmiş satış veya net yatırım getirisi değildir.` : "Aynı model/donanım, yakın yıl/km ve doğrulanmış hasar durumunda en az 5 bağımsız emsal bulunmadığı sürece fiyat avantajı hesaplanmaz."}`,
              evidenceIds: factIds.slice(0, 1),
              kind: "INFERENCE" as const,
            },
            ...(["elektrik", "hibrit"].includes(
              normalizeFuel(candidate.vehicle.fuel) ?? "",
            ) && !verified("batteryHealth")
              ? [
                  {
                    text: "Batarya sağlığı ve garanti bilinmiyor. Olası yenileme maliyeti ile yeniden satış etkisi hesaplanmadı; düşük kilometre batarya sağlık kanıtı değildir.",
                    evidenceIds: factIds.slice(0, 1),
                    kind: "INFERENCE" as const,
                  },
                ]
              : []),
          ]
        : []),
      {
        text:
          candidate.category === "ARABA"
            ? "İstenen araç fiyatı gerçekleşmiş satış değildir. Marka/model/donanım, yıl/km ve hasar eşleşmesi ile kaynak kanıtları olmadan ucuzluk veya yeniden satış avantajı hesaplanamaz."
            : !price || !area
              ? "Güncel fiyat veya geçerli alan yok; ucuzluk, m² değeri ve kira getirisi hesaplanamaz."
              : "TL/m² yalnızca yayıncının fiyat/alan beyanının bölümüdür; imar, hisse ve konum eşleşmeden başka adayın TL/m² değeri emsal veya iskontolu değer kanıtı sayılmaz.",
        evidenceIds: factIds.slice(0, 1),
        kind: "INFERENCE",
      },
      ...(current && candidate.mortgageEligible === false
        ? [
            {
              text: "Yayıncı krediye uygun olmadığını beyan ediyor. Banka/tapu doğrulaması olmadan nedeni bilinmez; doğrulanırsa finansman ve yeniden satış seçeneklerini daraltabilir.",
              evidenceIds: factIds.includes("villa-finance")
                ? ["villa-finance"]
                : factIds.slice(0, 1),
              kind: "PUBLISHER" as const,
            },
          ]
        : []),
      ...risks.map((text) => ({
        text,
        evidenceIds: factIds.slice(-1),
        kind: "PUBLISHER" as const,
      })),
      ...(current ? candidate.limitations : []).map((text) => ({
        text,
        evidenceIds: factIds.slice(0, 1),
        kind: "INFERENCE" as const,
      })),
      ...(current ? (candidate.reviewReasons ?? []) : []).map((text) => ({
        text,
        evidenceIds: factIds.slice(0, 1),
        kind: "INFERENCE" as const,
      })),
      ...economicReason,
      {
        text: "Güncel ilan sayısı piyasanın talep veya satış hızı değildir. Gerçek satış/kira işlemi, pazarlama süresi ve masraflar olmadan likidite ya da net getiri tahmin edilmedi.",
        evidenceIds: [],
        kind: "INFERENCE",
      },
    ],
    missing,
    factIds: [
      ...new Set([
        ...factIds,
        ...alternativeResearch
          .slice(0, 3)
          .flatMap((item) =>
            item.factIds.filter((id) => !!supportedFact(id, now, data)),
          ),
        ...Object.values(candidate.evidence ?? {})
          .flat()
          .filter((id) => current && supportedFact(id, now, data)),
        ...economicReason.flatMap((reason) => reason.evidenceIds),
        ...parcelReasons.flatMap((reason) => reason.evidenceIds),
        ...(rail ? [rail.id] : []),
      ]),
    ],
    assessment: currentAssessment,
    features: current ? candidate.features : [],
    alternatives:
      (candidate.category === "EV"
        ? "Aynı mahalle/tür, ayrı net-brüt alan, oda/yaş, iskân ve gerçek kira bilgisi açıklanmış bağımsız bölümler karşılaştırılabilir. Bu kanıtları olmayan bir konut daha ucuz veya daha iyi diye sıralanmadı."
        : candidate.category === "ARABA"
          ? "Aynı marka/model/donanım ve doğrulanmış gövde tipindeki benzer yıl/km/hasar araçlar araştırılmalı; farklı segmentleri düşük fiyatları nedeniyle alternatif sayma."
          : "Diğer Değirmenköy adayları fiyat/alan tablosunda görülebilir; arsa ile tarla ve hisseli ile müstakil beyanlı yerler doğrudan emsal yapılmaz. Resmî imar/tapu/yol kanıtı olan aynı sınıftaki alternatif daha değerlendirilebilir; böyle bir üstünlük belge olmadan varsayılmadı.") +
      alternativeNote,
  };
}

export function listingDecision(
  subject: Evidence,
  pool: Evidence[],
  sourceUrl: string | null,
  now = new Date(),
): Decision | null {
  if (subject.isDemo) return null;
  const assessment = assess(
    subject,
    pool.filter((item) => !item.isDemo),
    now,
  );
  const missing = assessment.riskFlags.map((flag) => flag.label);
  if (!sourceUrl || !researchUrlAllowed(sourceUrl))
    missing.push("İzinli doğrudan kaynak bağlantısı");
  if (assessment.score == null) missing.push("En az 5 güncel ve benzer emsal");
  const enough = assessment.score != null && missing.length === 0;
  const verdict: Verdict = !enough
    ? "Yetersiz veri"
    : assessment.score! >= 70
      ? "İncelemeye değer"
      : "Riskli";
  return {
    id: subject.id,
    title: subject.title,
    category: subject.category,
    location: [subject.province, subject.district, subject.neighborhood]
      .filter(Boolean)
      .join(" / "),
    sourceUrl: sourceUrl && researchUrlAllowed(sourceUrl) ? sourceUrl : null,
    observedAt: new Date(subject.lastObservedAt).toISOString(),
    price: subject.price,
    verdict,
    origin: "DATABASE",
    assessment,
    missing,
    factIds: [],
    unitPrice: observedUnitPrice(subject.price, subject.land?.sizeM2 ?? null),
    publishedAt: null,
    whyCould: [
      {
        text:
          assessment.score == null
            ? "Fiyat ve özellikler kayıtlı; emsal kanıtı tamamlanırsa karşılaştırılabilir."
            : `${assessment.sampleCount} eşleşen emsal üzerinde mevcut motorun sonucu: ${assessment.explanation}`,
        evidenceIds: [],
        kind: "INFERENCE",
      },
    ],
    whyNot: [
      {
        text: "İstenen fiyatlar gerçekleşmiş satış değil. Kaynak beyanları belge, ekspertiz veya gelecek getiri garantisi sayılmaz.",
        evidenceIds: [],
        kind: "INFERENCE",
      },
    ],
    alternatives: assessment.comparables.length
      ? "Aşağıdaki eşleşen emsalleri mevcut ilan detayında karşılaştır. Farklı mahalle, imar sınıfı veya araç segmenti daha iyi alternatif diye sunulmaz."
      : "Bu kayda yeterince benzer güncel gerçek alternatif yok; türler ve segmentler arasında fiyat sıralaması yapılmadı.",
    features:
      subject.category === "ARABA"
        ? [
            subject.vehicle?.make,
            subject.vehicle?.model,
            subject.vehicle?.trim,
            subject.vehicle?.bodyType,
            subject.vehicle?.fuel,
          ].filter((v): v is string => !!v)
        : [
            subject.neighborhood,
            subject.property?.propertyType,
            subject.property?.rooms,
            subject.land?.zoning,
          ].filter((v): v is string => !!v),
  };
}
