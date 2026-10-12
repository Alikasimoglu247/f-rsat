import * as cheerio from "cheerio";
import { normalizeBodyType, provinces } from "../constants";
import type {
  ResearchFetchResult,
  ResearchCandidate,
  ResearchSource,
  ResearchFact,
} from "./types";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const amount = (s: string) =>
  /^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(s)
    ? s.replaceAll(".", "").replace(",", ".")
    : null;

/** Read JSON literals already sent to the public page; never evaluate JavaScript or call /api. */
function publicProps(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html),
    chunks: string[] = [],
    objects: Record<string, unknown>[] = [];
  $("script").each((_, e) => {
    for (const m of $(e)
      .text()
      .matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
      try {
        chunks.push(JSON.parse(m[1]));
      } catch {
        /* Unsupported literal is not executable input. */
      }
    }
  });
  let visited = 0;
  const walk = (v: unknown, depth = 0) => {
    if (++visited > 50_000 || depth > 35 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1);
      return;
    }
    const record = v as Record<string, unknown>;
    if (
      typeof record.marka === "string" &&
      typeof record.model === "string" &&
      Number.isInteger(record.ilanNo)
    )
      objects.push(record);
    for (const item of Object.values(record)) walk(item, depth + 1);
  };
  for (const line of chunks.join("").split("\n")) {
    const match = line.match(/^[a-f\d]+:(.*)$/i);
    if (match) {
      try {
        walk(JSON.parse(match[1]));
      } catch {
        /* Partial or non-JSON Flight frame remains unsupported. */
      }
    }
  }
  return objects;
}

export function parseOtomolVehicle(page: ResearchFetchResult): {
  source: ResearchSource;
  facts: ResearchFact[];
  candidate: ResearchCandidate;
} | null {
  if (new URL(page.url).hostname !== "www.otomol.com") return null;
  const external = new URL(page.url).pathname.match(
    /-ikinci-el-araba-(\d+)$/,
  )?.[1];
  if (!external) return null;
  const props = publicProps(page.body).find(
    (p) => String(p.ilanNo) === external,
  );
  if (!props) return null;
  const $ = cheerio.load(page.body),
    attributes: Record<string, string> = {};
  $("div").each((_, e) => {
    const spans = $(e).children("span");
    if (spans.length === 2)
      attributes[clean(spans.first().text())] = clean(spans.last().text());
  });
  const bodyType = normalizeBodyType(attributes["Kasa Tipi"]);
  if (bodyType && !["SUV", "CROSSOVER"].includes(bodyType)) return null;
  if (attributes["İlan No"] !== external) return null;
  const priceText = $("span.text-2xl")
    .filter((_, e) => clean($(e).text()).startsWith("₺"))
    .first()
    .text();
  const price = amount(clean(priceText).replace(/^₺\s*/, ""));
  if (
    !price ||
    Number(price) <= 0 ||
    typeof props.fiyat !== "string" ||
    amount(props.fiyat) !== price
  )
    return null;
  const year = Number(attributes["Model Yılı"]),
    km = amount(attributes.Kilometre ?? "");
  if (
    !Number.isInteger(year) ||
    year !== props.modelYili ||
    !km ||
    Number(km) !== props.km
  )
    return null;
  const address = $("span")
    .filter((_, e) => clean($(e).text()) === "Şube")
    .first()
    .parent()
    .find("p")
    .first()
    .text();
  const location = clean(address).match(/(\p{L}+)\s*\/\s*(\p{L}+)$/u);
  const province = provinces.find(
    (p) =>
      p.toLocaleLowerCase("tr-TR") === location?.[2].toLocaleLowerCase("tr-TR"),
  );
  // A branch nickname alone does not prove a Marmara location.
  if (!location || !province) return null;
  const neighborhood = clean(address).match(/^(.+?)\s+Mah\./iu)?.[1] ?? "";
  const title = clean($("h1").first().text());
  if (
    !title ||
    !title.includes(String(props.model)) ||
    !title.includes(String(props.marka))
  )
    return null;
  const sourceId = `otomol-${external}`,
    offerId = `${sourceId}-offer`;
  const features = [
    `Yayıncı: ${props.marka} / ${props.model} / ${props.altModel ?? "donanım belirtilmemiş"}`,
    `Yayıncı: ${year} model, ${km} km, ${attributes["Yakıt Türü"]}, ${attributes["Vites Tipi"]}`,
    `Kaynak gövde alanı: ${attributes["Kasa Tipi"]}; konum şube adresi beyanıdır.`,
  ];
  const source: ResearchSource = {
    id: sourceId,
    name: `Otomol — ${external}`,
    url: page.url,
    retrievedAt: page.checkedAt,
    kind: "PUBLISHER",
    validForDays: 1,
    sha256: page.sha256,
    checkStatus: "VALID",
    usageNote:
      "Robots ve bağlantılı yayıncı politikaları kontrol edildi; sınırlı kişisel kaynaklı araştırma. Toplu yeniden kullanım lisansı veya satış mevcudiyeti teyidi değildir. Fotoğraf, iletişim bilgisi ve kişisel veri içe aktarılmaz; /api ve filtre sorgularına istek gönderilmez.",
  };
  const fact: ResearchFact = {
    id: offerId,
    sourceId,
    label: `${title}: ${price} TL istenen fiyat; ${year} model, ${km} km, ${attributes["Kasa Tipi"]}, şube ${location[1]} / ${province}. Yayıncı beyanı; gerçekleşmiş satış değildir.`,
    value: null,
    unit: null,
    period: null,
    scope: "Tekil ikinci el araç ilanı",
  };
  const candidate: ResearchCandidate = {
    id: sourceId,
    sourceId,
    externalId: external,
    sourceUrl: page.url,
    publishedAt: null,
    observedAt: page.checkedAt,
    title,
    category: "ARABA",
    province,
    district: location[1],
    neighborhood,
    transactionType: "SATILIK",
    price,
    netM2: null,
    grossM2: null,
    propertyType: null,
    rooms: null,
    buildingAge: null,
    condition: null,
    legalStatus: null,
    earthquakeInfo: null,
    mortgageEligible: null,
    factIds: [offerId],
    features,
    limitations: [
      "Yayın tarihi açıklanmıyor; erişilebilir sayfa ve InStock işareti satış mevcudiyeti teyidi değildir.",
      "Yayıncı ekspertiz/hasar beyanı belgeyle doğrulanmadı; çizim renkleri çözülmeden hasarsız kabul edilmez.",
      "Garanti, servis, MTV/sigorta ve elde tutma maliyeti için doğrulanmış veri yok.",
    ],
    sizeM2: null,
    classification: null,
    zoning: null,
    roadAccess: null,
    parcelNumber: null,
    sharedOwnership: null,
    agriculturalRestrictions: null,
    riskSignals: [],
    areaBasis: null,
    vehicle: {
      make: String(props.marka),
      model: String(props.model),
      trim: typeof props.altModel === "string" ? props.altModel : null,
      modelYear: year,
      mileage: Number(km),
      fuel: attributes["Yakıt Türü"] || null,
      transmission: attributes["Vites Tipi"] || null,
      damageHistory: null,
      bodyType,
      bodyTypeVerified: !!bodyType,
      bodyTypeEvidence: bodyType
        ? `Yayıncı ilan ${external}: Kasa Tipi = ${attributes["Kasa Tipi"]}; ${page.url}`.slice(
            0,
            300,
          )
        : null,
    },
  };
  return { source, facts: [fact], candidate };
}
