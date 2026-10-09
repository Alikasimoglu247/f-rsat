import { Prisma } from "@prisma/client";
import snapshot from "@/data/silivri-research.json";
import { assess, type Assessment, type Evidence } from "./analysis";

export type ResearchSource = (typeof snapshot.sources)[number];
export type ResearchFact = (typeof snapshot.facts)[number];
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
};

export const research = snapshot;
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
    /^[a-f0-9]{64}$/.test(source.sha256) &&
    Number.isFinite(age) &&
    age >= -60_000 &&
    age <= source.validForDays * day
  );
}
export function supportedFact(id: string, now = new Date(), data = research) {
  const fact = data.facts.find((item) => item.id === id);
  const source = data.sources.find((item) => item.id === fact?.sourceId);
  return fact && source && sourceFresh(source, now) ? fact : null;
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

export function researchDecision(
  candidate: (typeof research.candidates)[number],
  now = new Date(),
  assessment: Assessment | null = null,
): Decision {
  const source = research.sources.find(
    (item) => item.id === candidate.sourceId,
  );
  const bound =
    !!source &&
    source.url === candidate.sourceUrl &&
    source.retrievedAt === candidate.observedAt;
  const missing =
    candidate.category === "EV"
      ? [
          "Ayrı net/brüt m²",
          "Oda sayısı ve bağımsız bölüm",
          "Tapu, iskân ve teslim durumu",
          "Bina/zemin dayanımı",
          "Gerçek kira, aidat ve boşluk süresi",
        ]
      : [
          "Güncel resmî imar ve arazi sınıfı",
          "Tapu/pay ve takyidat belgeleri",
          "Belgeli yasal yol erişimi",
          ...(candidate.parcelNumber ? [] : ["Sayısal ada/parsel kimliği"]),
          ...(candidate.category === "TARLA"
            ? ["Tarımsal kullanım kısıtları ve gelir/gider"]
            : []),
        ];
  missing.push("Güncel satış mevcudiyeti ve fiyat teyidi");
  if (candidate.price == null) missing.unshift("Güncel TL satış fiyatı");
  if (!assessment || assessment.score == null)
    missing.push("En az 5 güncel, aynı nitelikte gerçek emsal");
  const factIds = bound
    ? candidate.factIds.filter((id) => supportedFact(id, now))
    : [];
  const policy = supportedFact("policy-rate", now);
  const rail = supportedFact("rail-stage", now);
  const economicReason: Reason[] = policy
    ? [
        {
          text: `TCMB politika faizi %${policy.value}. Bu, kredi veya mevduat teklifi değildir; finansman maliyeti ve sermayenin alternatif kullanım getirisi gerçek banka koşullarıyla karşılaştırılmadan yatırım kazancı hesaplanamaz.`,
          evidenceIds: [policy.id],
          kind: "INFERENCE",
        },
      ]
    : [];
  if (!bound || !source || !sourceFresh(source, now))
    missing.unshift(
      "Güncel kaynak kontrolü: araştırma gözlemi eskidi veya geçersiz",
    );
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
    price: candidate.price,
    unitPrice:
      bound && source && sourceFresh(source, now)
        ? observedUnitPrice(candidate.price, candidate.sizeM2)
        : null,
    verdict:
      bound &&
      source &&
      sourceFresh(source, now) &&
      candidate.riskSignals.length
        ? "Riskli"
        : "Yetersiz veri",
    origin: "RESEARCH",
    whyCould:
      bound && factIds.length
        ? [
            {
              text:
                candidate.category === "EV"
                  ? "Yayıncının villa/bahçe/havuz sunumu özel kullanım ihtiyacına uyabilir. Yatırım avantajı için aynı mahallede benzer villaların fiyat ve kira kanıtı gerekir."
                  : "Fiyat ve alan beyanı ilk bütçe/kullanım elemesine olanak veriyor. Mevcut kullanım hakkı, mülkiyet ve erişim belgelenirse kendi arazi sınıfındaki emsallerle yatırım tezi araştırılabilir; düşük toplam bedel tek başına fırsat değil.",
              evidenceIds: [factIds[0]],
              kind: "INFERENCE",
            },
            ...(rail
              ? [
                  {
                    text: "Trakya demiryolu yatırımı bölgesel erişim ve talep açısından araştırma gerekçesi olabilir. Halkalı bağlantısı hâlâ yapımda; bu adayın istasyona erişimi veya değer artışı doğrulanmadı.",
                    evidenceIds: [rail.id],
                    kind: "INFERENCE" as const,
                  },
                ]
              : []),
          ]
        : [],
    whyNot: [
      {
        text:
          candidate.price == null
            ? "Fiyat ve geçerli alan yok; ucuzluk, m² değeri, kira getirisi ve fırsat puanı hesaplanamaz."
            : "TL/m² yalnızca yayıncının fiyat/alan beyanının bölümüdür; imar, hisse ve konum eşleşmeden başka adayın TL/m² değeri emsal veya iskontolu değer kanıtı sayılmaz.",
        evidenceIds: factIds.slice(0, 1),
        kind: "INFERENCE",
      },
      ...(factIds.includes("villa-finance")
        ? [
            {
              text: "Yayıncı krediye uygun olmadığını beyan ediyor. Banka/tapu doğrulaması olmadan nedeni bilinmez; doğrulanırsa finansman ve yeniden satış seçeneklerini daraltabilir.",
              evidenceIds: ["villa-finance"],
              kind: "PUBLISHER" as const,
            },
          ]
        : []),
      ...candidate.riskSignals.map((text) => ({
        text,
        evidenceIds: factIds.slice(-1),
        kind: "PUBLISHER" as const,
      })),
      ...candidate.limitations.map((text) => ({
        text,
        evidenceIds: factIds.slice(0, 1),
        kind: "INFERENCE" as const,
      })),
      ...economicReason,
    ],
    missing,
    factIds: [
      ...factIds,
      ...(policy ? [policy.id] : []),
      ...(rail ? [rail.id] : []),
    ],
    assessment,
    features: candidate.features,
    alternatives:
      candidate.category === "EV"
        ? "Fiyatı, net/brüt alanı, iskânı ve kira örneği açıklanmış aynı mahalle/türdeki bir bağımsız bölüm daha değerlendirilebilir olur. Bu pilotta böyle bir alternatif doğrulanmadığı için daha ucuz veya daha iyi diye sıralanmadı."
        : "Bu pilotun diğer Değirmenköy adayları fiyat/alan tablosunda görülebilir; arsa ile tarla ve hisseli ile müstakil beyanlı yerler doğrudan emsal yapılmaz. Resmî imar/tapu/yol kanıtı olan aynı sınıfta bir alternatif yatırım açısından daha değerlendirilebilir; böyle bir üstünlük henüz doğrulanmadı.",
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
