import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import * as cheerio from "cheerio";
import {
  accessChallenge,
  robotsAllows,
  safeResearchUrl,
  termsRestrictAutomation,
} from "./policy";
import { fetchResearchPage, ResearchTransportError } from "./transport";
import type {
  AcquisitionResult,
  ResearchCandidate,
  ResearchFact,
  ResearchFetcher,
  ResearchFetchResult,
  ResearchSource,
  SourceCheck,
} from "./types";

const tcmb = "https://www.tcmb.gov.tr/";
const cpiUrl =
  "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Enflasyon+Verileri";
const housingUrl =
  "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Reel+Sektor+Istatistikleri/Konut+Fiyat+Endeksi/";
const months = [
  "ocak",
  "şubat",
  "mart",
  "nisan",
  "mayıs",
  "haziran",
  "temmuz",
  "ağustos",
  "eylül",
  "ekim",
  "kasım",
  "aralık",
];
const clean = (value: string) =>
  value
    .replace(/[\uE000-\uF8FF\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
function bodyText(html: string) {
  const $ = cheerio.load(html);
  $("script,style").remove();
  return clean($("body").text());
}
function date(value: string) {
  const match = clean(value)
    .toLocaleLowerCase("tr-TR")
    .match(/(\d{1,2})[.\s]+([a-zçğıöşü]+)[.\s]+(\d{4})/u);
  if (!match) return null;
  const month = months.indexOf(match[2]);
  if (month < 0) return null;
  const result = `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const parsed = new Date(result);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result
    ? null
    : result;
}
/** Currency is accepted only from the selected price field, never a title or search snippet. */
export function parseTurkishAmount(value: string) {
  const text = clean(value)
    .replace(/(?:TL|₺|m²|m2)/giu, "")
    .trim();
  if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(text)) return null;
  const normalized = text.replaceAll(".", "").replace(",", ".");
  return Number(normalized) > 0 && Number.isFinite(Number(normalized))
    ? normalized
    : null;
}
function source(
  page: ResearchFetchResult,
  id: string,
  name: string,
  kind = "OFFICIAL",
  validForDays = 45,
): ResearchSource {
  return {
    id,
    name,
    url: page.url,
    retrievedAt: page.checkedAt,
    kind,
    validForDays: Math.min(validForDays, kind === "PUBLISHER" ? 1 : 7),
    sha256: page.sha256,
    checkStatus: "VALID",
    usageNote:
      kind === "PUBLISHER"
        ? "Sınırlı kişisel araştırma: robots ve bağlantılı kullanım şartları bu çalışmada kontrol edildi. Toplu toplama, veri akışı veya yeniden yayım lisansı doğrulanmış değildir. İlan bilgileri yayıncı beyanıdır; satış mevcudiyeti ve hukuki durum teyidi değildir."
        : "Kaynak gösterilen kişisel araştırma; resmî yayın tarihindeki kapsam korunur. Ticari yeniden kullanım lisansı verilmiş sayılmaz.",
  };
}
function fact(
  id: string,
  sourceId: string,
  label: string,
  value: number | null,
  unit = "",
  period = "",
  scope = "Türkiye",
): ResearchFact {
  return { id, sourceId, label, value, unit, period, scope };
}
const originalIds: Record<string, string> = {
  "1096": "genc-300",
  "1099": "genc-farm250",
  "1090": "genc-zoned250",
};
/** An undated project announcement is context, never a priced listing or parcel deed. */
export function parseDivisionContext(
  page: ResearchFetchResult,
): ResearchFact[] {
  const $ = cheerio.load(page.body);
  const paragraphs = clean($("p").text()).toLocaleLowerCase("tr-TR");
  const heading = clean($("title,h4.classic-title").text()).toLocaleLowerCase(
    "tr-TR",
  );
  if (
    !/değirmenköy/u.test(heading) ||
    !/özel parselasyon/u.test(heading) ||
    !/hisseli\s+arsalar/u.test(paragraphs)
  )
    return [];
  return [
    fact(
      "genc-private-division",
      "division-context",
      "Yayıncının Değirmenköy duyurusu özel parselasyon ve hisseli arsalar içeriyor. Duyurunun yayın tarihi ve güncel ilan parselleriyle bağı doğrulanmadı; duyurudaki kampanya fiyatı güncel fiyat veya emsal alınmadı.",
      null,
      "",
      "",
      "Genç City Değirmenköy duyurusu; tekil parsel bağlantısı yok",
    ),
  ];
}
export function parseLandPage(page: ResearchFetchResult): {
  source: ResearchSource;
  facts: ResearchFact[];
  candidate: ResearchCandidate;
} | null {
  const $ = cheerio.load(page.body),
    attributes: Record<string, string> = {};
  $("dt").each((_, element) => {
    const label = clean($(element).text()),
      value = clean($(element).next("dd").text());
    attributes[label] = value === "Bilgi Yok" ? "" : value;
  });
  $("li.lirenk").each((_, element) => {
    const clone = $(element).clone();
    clone.children().remove();
    const label = clean(clone.text()),
      value = clean($(element).find("span").first().text());
    if (label) attributes[label] = value === "Bilgi Yok" ? "" : value;
  });
  const title = clean($("title").text().split(" - ")[0]),
    text = bodyText(page.body);
  const folded = text.toLocaleLowerCase("tr-TR"),
    foldedTitle = title.toLocaleLowerCase("tr-TR");
  if (
    !/değirmenköy/u.test(folded) ||
    !/silivri/u.test(folded) ||
    !/satılık (?:arsa|tarla|yatırımlık arsa)/u.test(
      (attributes.Kategori ?? "").toLocaleLowerCase("tr-TR"),
    )
  )
    return null;
  const priceField = $("[itemprop=price],.detaykisabilgifiyat").first().text();
  const price = /(?:TL|₺)/iu.test(priceField)
    ? parseTurkishAmount(priceField)
    : null;
  const external =
    attributes["İlan No"] || folded.match(/ilan no\s*:?\s*(\d+)/u)?.[1] || null;
  if (!external || !title) return null;
  const isGenc = new URL(page.url).hostname === "www.genccity.com";
  const id = isGenc
    ? (originalIds[external] ?? `genc-${external}`)
    : `akgun-${external}`;
  const sourceId = !isGenc && /3653/.test(page.url) ? "akgun-3653" : id;
  const structuredArea = parseTurkishAmount(
    attributes.Metrekare ||
      attributes["Metrekare (Brüt)"] ||
      attributes["Brüt Alan"] ||
      "",
  );
  const titleArea =
    title.match(/\b(\d{2,5})\s*(?:m²|m2|metre)(?=\s|$|[-.,])/iu)?.[1] ?? null;
  const size = structuredArea ?? titleArea;
  const sharedOwnership = attributes["Tapu Durumu"] || null;
  const zoning = attributes["İmar Durumu"] || null;
  const ada = attributes.Ada,
    parcel = attributes.Parsel;
  const parcelNumber =
    /^\d+$/.test(ada ?? "") && /^\d+$/.test(parcel ?? "")
      ? `${ada}/${parcel}`
      : null;
  const riskSignals: string[] = [],
    limitations = [
      "Halka açık sayfanın erişilebilirliği, satışın hâlâ açık olduğu veya bugünkü fiyatın teyit edildiği anlamına gelmez.",
      "İmar, tapu, yol, zemin, likidite ve gerçekleşmiş satış verileri resmî belgeyle doğrulanmadı.",
    ];
  if (sharedOwnership?.toLocaleLowerCase("tr-TR").includes("hisseli"))
    riskSignals.push(
      "Hisseli tapu beyanı: pay, kullanım sınırı ve bağımsız mülkiyet belirsiz.",
    );
  if (!zoning && /imarlı/u.test(foldedTitle)) {
    riskSignals.push(
      "Başlıktaki imar beyanı yapılandırılmış imar alanıyla doğrulanmıyor.",
    );
    limitations.push("Başlık imarlı diyor; imar alanı boş veya Bilgi Yok.");
  }
  if (
    /ilk imara|imara (?:ilk )?açılacak|prefabrik.*(?:yapılabilir|konulabilir)/u.test(
      folded,
    )
  )
    riskSignals.push(
      "Gelecekte imar veya yapılaşma vaadi için resmî kanıt yok.",
    );
  const references = [
    ...folded.matchAll(
      /(?:ilan\s*(?:no|numarası)|ilan\s*kodu)\s*[:.]?\s*(\d{4,})/gu,
    ),
  ].map((match) => match[1]);
  const conflict = references.some((reference) => reference !== external);
  if (conflict)
    limitations.push(
      "Yapılandırılmış ilan numarası ile açıklama numarası çelişiyor; kimlik için kanonik URL kullanılmalı.",
    );
  if (!structuredArea && titleArea)
    limitations.push(
      "Alan yalnızca başlık beyanından alındı; yapılandırılmış alan bulunmuyor.",
    );
  const offer = fact(
    `${sourceId}-offer`,
    sourceId,
    `${external}: ${price ?? "fiyat yok"} TL; ${size ?? "alan yok"} m²; ${attributes.Kategori}; Değirmenköy / Silivri. Yayıncı beyanı.`,
    null,
    "",
    date(attributes["İlan Tarihi"] ?? "") ?? "",
    "Değirmenköy / Silivri",
  );
  const candidate: ResearchCandidate = {
    id: sourceId,
    sourceId,
    externalId: conflict ? null : external,
    externalReferenceConflict: conflict,
    sourceUrl: page.url,
    publishedAt: date(attributes["İlan Tarihi"] ?? ""),
    observedAt: page.checkedAt,
    title,
    category: /Tarla/iu.test(attributes.Kategori) ? "TARLA" : "ARSA",
    province: "İstanbul",
    district: "Silivri",
    neighborhood: "Değirmenköy",
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
    mortgageEligible: /^(?:uygun|krediye uygundur)$/u.test(
      (attributes["Kredi Durumu"] ?? "").toLocaleLowerCase("tr-TR"),
    )
      ? true
      : attributes["Kredi Durumu"] === "Uygun Değil"
        ? false
        : null,
    factIds: [offer.id],
    features: [
      size ? `Yayıncı alan beyanı: ${size} m²` : "Alan belirtilmemiş",
      ...(sharedOwnership ? [`Yayıncı tapu beyanı: ${sharedOwnership}`] : []),
    ],
    limitations,
    sizeM2: size,
    classification: /Tarla/iu.test(attributes.Kategori) ? "TARLA" : null,
    zoning,
    roadAccess: null,
    parcelNumber,
    sharedOwnership,
    agriculturalRestrictions: null,
    riskSignals,
    areaBasis: size ? "PUBLISHER_PARCEL" : null,
  };
  return {
    source: source(
      page,
      sourceId,
      `${isGenc ? "Genç City" : "Akgün Gayrimenkul"} — ${external}`,
      "PUBLISHER",
      7,
    ),
    facts: [offer],
    candidate,
  };
}
export function parseInflation(page: ResearchFetchResult) {
  const $ = cheerio.load(page.body),
    facts: ResearchFact[] = [];
  $("tr").each((_, element) => {
    const cells = $(element)
      .find("td")
      .map((_, cell) => clean($(cell).text()))
      .get();
    const period = cells[0]?.match(/^(\d{2})-(\d{4})$/),
      value = Number(cells[1]?.replace(",", "."));
    if (
      period &&
      Number(period[1]) >= 1 &&
      Number(period[1]) <= 12 &&
      Number.isFinite(value)
    ) {
      const iso = `${period[2]}-${period[1]}`;
      facts.push(fact(`cpi-${iso}`, "cpi", "Yıllık TÜFE", value, "%", iso));
    }
  });
  // Keep the most recent thirteen periods for matched-period real comparisons.
  return facts
    .sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""))
    .slice(0, 13);
}
export function parsePolicy(page: ResearchFetchResult) {
  const text = bodyText(page.body);
  const value = text.match(
    /politika faizi olan bir hafta vadeli repo ihale faiz oran(?:ı|ının)[\s\S]{0,100}?yüzde\s+(\d+(?:,\d+)?)/iu,
  )?.[1];
  const dates = [
    ...text.matchAll(
      /\b\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+20\d{2}\b/giu,
    ),
  ]
    .map((m) => date(m[0]))
    .filter((x): x is string => Boolean(x));
  if (!value || !dates.length) return [];
  return [
    fact(
      "policy-rate",
      "policy",
      "Politika faizi; mevduat veya kredi teklif oranı değildir",
      Number(value.replace(",", ".")),
      "%",
      dates[0],
    ),
  ];
}
function pdfText(body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", "-", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10_000,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 500_000) child.kill();
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error("PDF metin çıkarımı kullanılamıyor.")),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(Buffer.from(body, "latin1"));
  });
}
export function parseHousingText(text: string) {
  const normalized = clean(text),
    month = normalized
      .toLocaleLowerCase("tr-TR")
      .match(
        /(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+(20\d{2})/u,
      );
  if (!month) return [];
  const period = `${month[2]}-${String(months.indexOf(month[1]) + 1).padStart(2, "0")}`,
    facts: ResearchFact[] = [];
  const nominal = normalized.match(
    /nominal olarak (?:ise )?yüzde\s+([\d,]+)/iu,
  );
  if (nominal)
    facts.push(
      fact(
        "housing-turkey",
        "housing",
        "Konut fiyatları: nominal yıllık değişim",
        Number(nominal[1].replace(",", ".")),
        "%",
        period,
      ),
    );
  const real = normalized.match(
    /reel olarak (?:ise )?yüzde\s+([\d,]+)\s+oranında\s+(azalmış|artmış)/iu,
  );
  if (real)
    facts.push(
      fact(
        "housing-real",
        "housing",
        "Konut fiyatları: reel yıllık değişim",
        Number(real[1].replace(",", ".")) * (real[2].startsWith("az") ? -1 : 1),
        "%",
        period,
      ),
    );
  // Read explicit labelled regional value, not an assumed table position.
  const lines = text.split(/\r?\n/),
    labelRow = lines.findIndex((line) => /TR10\s*\(İstanbul\)/u.test(line));
  if (labelRow >= 0) {
    const column = lines[labelRow].indexOf("TR10");
    const values = lines.slice(labelRow + 1, labelRow + 7).flatMap((line) =>
      [...line.matchAll(/%\s*([\d,]+)/g)].map((match) => ({
        column: match.index!,
        value: Number(match[1].replace(",", ".")),
      })),
    );
    const aligned = values
      .filter((v) => Math.abs(v.column - column) <= 12)
      .sort(
        (a, b) => Math.abs(a.column - column) - Math.abs(b.column - column),
      )[0];
    if (aligned)
      facts.push(
        fact(
          "housing-istanbul",
          "housing",
          "Konut fiyatları: nominal yıllık değişim",
          aligned.value,
          "%",
          period,
          "İstanbul",
        ),
      );
  }
  return facts;
}
export function parseMunicipality(page: ResearchFetchResult) {
  const $ = cheerio.load(page.body),
    facts: ResearchFact[] = [];
  // Only public plan cards; omit unrelated people and contact information.
  $(".imar-detail-grid").each((_, element) => {
    const fields: Record<string, string> = {};
    $(element)
      .find(".imar-detail-item")
      .each((_, item) => {
        fields[clean($(item).find(".imar-detail-label").text())] = clean(
          $(item).find(".imar-detail-value").text(),
        );
      });
    const title = `${fields["Mahalle / Köy"] ?? "Silivri"} ${fields["Plan Türü"] ?? "imar uygulaması"}`;
    const start = fields["Askıya Çıkış"],
      end = fields["Askıdan İniş"];
    if (!start || !end) return;
    const id = /Mimarsinan/.test(title)
      ? "mimarsinan-plan"
      : /Cumhuriyet/.test(title)
        ? "cumhuriyet-plan"
        : `plan-${createHash("sha256").update(title).digest("hex").slice(0, 12)}`;
    const description = clean(
      $(element).closest(".document-modal-source").text(),
    ).toLocaleLowerCase("tr-TR");
    if (!facts.some((f) => f.id === id))
      facts.push({
        ...fact(
          id,
          "municipality",
          `${clean(title)}: askı ${date(start)}–${date(end)}; ${description.includes("mahkeme iptal") ? "mahkeme iptali sonrası uygulama. " : ""}Yalnızca belirtilen uygulama alanı/parseller; Değirmenköy imar hakkı kanıtı değildir.`,
          null,
          "",
          date(start) ?? "",
          "Belirtilen uygulama alanı / Silivri",
        ),
        validUntil: `${date(end)}T20:59:59.999Z`,
      });
  });
  return facts;
}
export function parseRail(page: ResearchFetchResult) {
  const $ = cheerio.load(page.body),
    title = clean($("title").text());
  if (!/halkalı|kapıkule|çerkezköy/u.test(title.toLocaleLowerCase("tr-TR")))
    return [];
  const text = bodyText(page.body),
    published =
      date(text.match(/\b\d{1,2}\s+\S+\s+20\d{2}\b/u)?.[0] ?? "") ?? "";
  // Rephrase observable status; never convert an opening announcement into a completed opening.
  const underway =
    /(?:Ispartakule|Halkalı)[\s\S]{0,300}(?:yapım çalışmalarına devam|çalışmalar.*sür)/iu.test(
      text,
    );
  const announced = /9 Ekim.{0,150}(?:açılacağını|açılacağı|açılacak)/iu.test(
    text,
  );
  if (!underway && !announced) return [];
  return [
    fact(
      "rail-stage",
      "rail",
      `${announced ? "Çerkezköy–Kapıkule kesimi için 9 Ekim açılışı duyuruluyor. " : ""}${underway ? "Halkalı bağlantısının diğer etapları yapımda. " : ""}Silivri istasyonu veya tekil parsel değer artışı doğrulanmıyor.`,
      null,
      "",
      published,
      "Trakya demiryolu koridoru",
    ),
  ];
}

export async function collectResearch(
  options: {
    knownUrls?: string[];
    blockedUrls?: string[];
    pageBudget?: number;
    fetcher?: ResearchFetcher;
    now?: Date;
  } = {},
): Promise<AcquisitionResult> {
  const fetcher = options.fetcher ?? fetchResearchPage,
    now = options.now ?? new Date(),
    result: AcquisitionResult = {
      sources: [],
      facts: [],
      candidates: [],
      discoveries: [],
      checks: [],
    };
  const known = new Set((options.knownUrls ?? []).slice(0, 60)),
    blocked = new Set(
      (options.blockedUrls ?? []).map((u) => {
        try {
          return new URL(u).hostname;
        } catch {
          return u;
        }
      }),
    );
  const pages = new Map<string, ResearchFetchResult>(),
    policies = new Map<string, string | null>();
  let requestCount = 0;
  const record = (
    url: string,
    status: SourceCheck["status"],
    reason: string,
    page?: ResearchFetchResult,
    errorHttpStatus?: number,
  ) =>
    result.checks.push({
      url,
      status,
      reason,
      checkedAt: page?.checkedAt ?? now.toISOString(),
      ...(page ? { sha256: page.sha256, httpStatus: page.status } : {}),
      ...(errorHttpStatus ? { httpStatus: errorHttpStatus } : {}),
    });
  async function raw(url: string) {
    if (!safeResearchUrl(url)) {
      record(
        url,
        "POLICY_REVIEW",
        "Host araştırma kapsamına alınmadı; istek gönderilmedi.",
      );
      return null;
    }
    const host = new URL(url).hostname;
    if (blocked.has(host)) {
      record(
        url,
        "ACCESS_BLOCKED",
        "Önceki erişim engeli nedeniyle istek gönderilmedi.",
      );
      return null;
    }
    if (pages.has(url)) return pages.get(url)!;
    if (requestCount >= 50) {
      record(
        url,
        "BUDGET_DEFERRED",
        "Çalışma başına 50 istek sınırı; sonraki çalışmaya bırakıldı.",
      );
      return null;
    }
    requestCount++;
    try {
      const page = await fetcher(url, {
        maxBytes: 1_500_000,
        timeoutMs: 18_000,
      });
      if ([401, 403, 429].includes(page.status) || accessChallenge(page.body)) {
        blocked.add(host);
        record(
          url,
          "ACCESS_BLOCKED",
          "Kaynak koruması veya erişim engeli; kaynakta işlem durdu.",
          page,
        );
        return null;
      }
      pages.set(url, page);
      return page;
    } catch (error) {
      if (error instanceof ResearchTransportError) {
        if (error.code === "ACCESS_BLOCKED") blocked.add(host);
        record(url, error.code, error.message, undefined, error.httpStatus);
        return null;
      }
      record(
        url,
        "FAILED",
        error instanceof Error ? error.message : "Ağ isteği başarısız.",
      );
      return null;
    }
  }
  async function permitted(url: string) {
    if (!safeResearchUrl(url)) return raw(url);
    const origin = new URL(url).origin;
    if (!policies.has(origin)) {
      const robots = await raw(`${origin}/robots.txt`);
      if (!robots || ![200, 404].includes(robots.status)) {
        policies.set(origin, null);
        return null;
      }
      policies.set(origin, robots.status === 200 ? robots.body : "");
      record(
        `${origin}/robots.txt`,
        "PARSED",
        robots.status === 200
          ? "Robots yönergeleri bu çalışmada okundu; veri kullanım lisansı sayılmaz."
          : "Yayımlanmış robots dosyası bulunmadı; kullanım koşulları ayrıca denetlenir.",
        robots,
      );
    }
    const rules = policies.get(origin);
    if (rules == null) {
      record(
        url,
        "FAILED",
        "Kaynağın erişim politikası okunamadı; ilan alınmadı.",
      );
      return null;
    }
    if (!robotsAllows(rules, url)) {
      record(
        url,
        "ROBOTS_DENIED",
        "Robots bu yola erişimi yasaklıyor; istek gönderilmedi.",
      );
      return null;
    }
    return raw(url);
  }
  async function inspectTerms(page: ResearchFetchResult) {
    const $ = cheerio.load(page.body),
      links = $("a")
        .filter((_, e) =>
          /kullanım\s+(?:şartları|koşulları)|\bterms(?: of (?:use|service))?\b|yasal uyarı/iu.test(
            clean($(e).text()),
          ),
        )
        .map((_, e) => $(e).attr("href"))
        .get()
        .slice(0, 2);
    for (const href of links) {
      const url = new URL(href, page.url).href;
      result.discoveries.push({
        url,
        kind: "POLICY",
        discoveredFrom: page.url,
        status: safeResearchUrl(url) ? "ALLOWED" : "REVIEW_REQUIRED",
      });
      if (!safeResearchUrl(url)) {
        blocked.add(new URL(page.url).hostname);
        record(
          page.url,
          "POLICY_REVIEW",
          "Kullanım koşulları farklı ve incelenmemiş kaynakta; otomatik veri alımı durdu.",
        );
        return false;
      }
      const terms = await permitted(url);
      if (!terms || terms.status !== 200) {
        blocked.add(new URL(page.url).hostname);
        record(
          page.url,
          "POLICY_REVIEW",
          "Bağlantılı kullanım şartları doğrulanamadı.",
        );
        return false;
      }
      if (termsRestrictAutomation(bodyText(terms.body))) {
        blocked.add(new URL(page.url).hostname);
        record(
          page.url,
          "POLICY_REVIEW",
          "Kullanım koşulları otomatik toplamayı kısıtlıyor; kaynakta işlem durdu.",
        );
        return false;
      }
      record(
        url,
        "PARSED",
        "Bağlantılı kullanım koşulları incelendi; sınırlı kişisel araştırma dışında lisans iddiası yok.",
        terms,
      );
    }
    return true;
  }
  function discovered(
    page: ResearchFetchResult,
    filter: RegExp,
    kind: "LISTING" | "OFFICIAL_RELEASE" | "CONTEXT",
  ) {
    const $ = cheerio.load(page.body),
      urls: string[] = [];
    $("a[href]").each((_, element) => {
      const href = $(element).attr("href")!;
      if (!filter.test(href + " " + clean($(element).text()))) return;
      let url: string;
      try {
        url = new URL(href, page.url).href;
      } catch {
        return;
      }
      if (!/^https:/.test(url) || urls.includes(url)) return;
      if (urls.length >= 30) return;
      urls.push(url);
      result.discoveries.push({
        url,
        kind,
        discoveredFrom: page.url,
        status: safeResearchUrl(url) ? "ALLOWED" : "REVIEW_REQUIRED",
      });
    });
    return urls.slice(0, 30);
  }
  function accept(
    page: ResearchFetchResult,
    parsedSource: ResearchSource,
    facts: ResearchFact[],
    candidate?: ResearchCandidate,
  ) {
    result.sources.push(parsedSource);
    result.facts.push(...facts);
    if (candidate) result.candidates.push(candidate);
    record(
      page.url,
      "PARSED",
      "Mevcut yanıttan alan çıkarımı doğrulandı; erişilebilirlik satış mevcudiyeti teyidi değildir.",
      page,
    );
  }
  function acceptFacts(
    page: ResearchFetchResult,
    parsedSource: ResearchSource,
    facts: ResearchFact[],
    reason: string,
  ) {
    if (facts.length) accept(page, parsedSource, facts);
    else record(page.url, "UNSUPPORTED", reason, page);
  }
  const central = await permitted(tcmb);
  if (central?.status === 200 && (await inspectTerms(central))) {
    const links = discovered(
      central,
      /Faiz Oranlarına İlişkin Basın Duyurusu|Para Politikası Kurulu Toplantı Kararı/u,
      "OFFICIAL_RELEASE",
    );
    const policyUrl = links.find((url) => /\/duy\d{4}-\d+/i.test(url));
    if (policyUrl) {
      const page = await permitted(policyUrl);
      if (page?.status === 200) {
        const facts = parsePolicy(page);
        acceptFacts(
          page,
          source(page, "policy", "TCMB — güncel politika faizi duyurusu"),
          facts,
          "Faiz duyurusu alanları ayrıştırılamadı.",
        );
      }
    }
    const inflation = await permitted(cpiUrl);
    if (inflation?.status === 200) {
      const facts = parseInflation(inflation);
      acceptFacts(
        inflation,
        source(inflation, "cpi", "TCMB / TÜİK — tüketici fiyatları"),
        facts,
        "Enflasyon tablosu ayrıştırılamadı.",
      );
    }
    const landing = await permitted(housingUrl);
    if (landing?.status === 200) {
      const urls = discovered(landing, /KFE\.pdf/i, "OFFICIAL_RELEASE");
      if (urls[0]) {
        const pdf = await permitted(urls[0]);
        if (pdf?.status === 200 && /pdf/i.test(pdf.contentType)) {
          try {
            const facts = parseHousingText(await pdfText(pdf.body));
            acceptFacts(
              pdf,
              source(
                pdf,
                "housing",
                "TCMB — güncel konut fiyat endeksi",
                "OFFICIAL",
                7,
              ),
              facts,
              "PDF'deki endeks değerleri ayrıştırılamadı.",
            );
          } catch {
            record(
              pdf.url,
              "UNSUPPORTED",
              "Güvenli PDF metin çıkarımı kullanılamıyor; eski değerlerin tarihi yenilenmedi.",
              pdf,
            );
          }
        }
      }
    }
  }
  const municipality = await permitted("https://www.silivri.bel.tr/");
  if (municipality?.status === 200 && (await inspectTerms(municipality))) {
    discovered(
      municipality,
      /\/haberler?\/|imar|parsel|plan/iu,
      "OFFICIAL_RELEASE",
    );
    const facts = parseMunicipality(municipality);
    acceptFacts(
      municipality,
      source(
        municipality,
        "municipality",
        "Silivri Belediyesi — güncel askı ilanları",
        "OFFICIAL",
        7,
      ),
      facts,
      "Güncel askı ilanları ayrıştırılamadı; önceki kanıt yenilenmedi.",
    );
  }
  const uab = await permitted("https://www.uab.gov.tr/");
  const railUrls =
    uab?.status === 200 && (await inspectTerms(uab))
      ? discovered(
          uab,
          /\/haberler\/.*(?:kapikule|cerkezkoy|halkali)/i,
          "OFFICIAL_RELEASE",
        )
      : [];
  const oldRail = [...known].filter(
    (url) =>
      url.includes("uab.gov.tr/haberler/") &&
      /kapikule|cerkezkoy|halkali/.test(url),
  );
  for (const url of [
    ...new Set([...railUrls.slice(0, 1), ...oldRail.slice(0, 1)]),
  ]) {
    const page = await permitted(url);
    if (page?.status === 200) {
      const facts = parseRail(page);
      acceptFacts(
        page,
        source(page, "rail", "UAB — demiryolu gelişmesi", "OFFICIAL", 7),
        facts,
        "Bölgesel ulaşım durumu ayrıştırılamadı; eski beyan yenilenmedi.",
      );
    }
  }
  const catalog = await permitted("https://www.genccity.com/");
  let listingUrls: string[] = [];
  if (catalog?.status === 200 && (await inspectTerms(catalog))) {
    const contextUrl = discovered(
      catalog,
      /istanbul-silivri-degirmenkoyde-ozel-parselasyonlu-arsalar/i,
      "CONTEXT",
    )[0];
    if (contextUrl) {
      const context = await permitted(contextUrl);
      if (context?.status === 200)
        acceptFacts(
          context,
          source(
            context,
            "division-context",
            "Genç City — özel parselasyon duyurusu",
            "PUBLISHER",
            1,
          ),
          parseDivisionContext(context),
          "Duyuru kapsamı doğrulanamadı; eski kampanya fiyatı alınmadı.",
        );
    }
    const frontier = discovered(
      catalog,
      /\/satilik-(?:arsa|tarla)\/[^\s]*degirmenkoy/i,
      "LISTING",
    );
    const previous = [...known]
      .filter(
        (url) =>
          safeResearchUrl(url) &&
          new URL(url).hostname === "www.genccity.com" &&
          /\/satilik-(?:arsa|tarla)\//.test(url),
      )
      .slice(0, 20);
    const budget = Math.min(8, Math.max(1, options.pageBudget ?? 2));
    listingUrls = [
      ...new Set([
        ...previous,
        ...frontier.filter((url) => !known.has(url)).slice(0, budget),
      ]),
    ];
    for (const url of listingUrls) {
      const page = await permitted(url);
      if (!page) continue;
      if (page.status !== 200) {
        record(
          url,
          "FAILED",
          `İlan yanıtı HTTP ${page.status}; eski kanıt yenilenmedi.`,
          page,
        );
        continue;
      }
      const parsed = parseLandPage(page);
      if (parsed) accept(page, parsed.source, parsed.facts, parsed.candidate);
      else
        record(
          url,
          "UNSUPPORTED",
          "İlan şablonu veya segment doğrulanamadı; alan uydurulmadı.",
          page,
        );
    }
  }
  // Preserve known first-party observations outside the current small-land frontier.
  for (const url of [...known]
    .filter(
      (url) =>
        safeResearchUrl(url) &&
        new URL(url).hostname === "www.gayrimenkulakgun.com",
    )
    .slice(0, 2)) {
    const home = await permitted(new URL(url).origin + "/");
    if (!home || home.status !== 200 || !(await inspectTerms(home))) continue;
    const page = await permitted(url);
    if (!page || page.status !== 200) continue;
    const parsed = parseLandPage(page);
    if (parsed) accept(page, parsed.source, parsed.facts, parsed.candidate);
    else
      record(
        url,
        "UNSUPPORTED",
        "Önceki kaynak alanları yeniden doğrulanamadı.",
        page,
      );
  }
  // Recheck every known URL or explicitly mark it outside this adapter's supported scope.
  for (const url of known) {
    if (
      result.checks.some((check) => check.url === url) ||
      result.sources.some((s) => s.url === url)
    )
      continue;
    if (!safeResearchUrl(url)) {
      record(
        url,
        "POLICY_REVIEW",
        "Kaynak güncel izinli adaptör kapsamı dışında; eski kanıt yenilenmedi.",
      );
      continue;
    }
    if (blocked.has(new URL(url).hostname)) {
      record(
        url,
        "ACCESS_BLOCKED",
        "Kaynak engeli nedeniyle tekrar istek gönderilmedi.",
      );
      continue;
    }
    const page = await permitted(url);
    if (page)
      record(
        url,
        page.status === 200 ? "UNSUPPORTED" : "FAILED",
        "Sayfa kontrol edildi; güncel alan çıkarımı desteklenmediği için eski kanıt karar için yenilenmedi.",
        page,
      );
  }
  result.discoveries = result.discoveries.filter(
    (item, index, array) =>
      array.findIndex((other) => other.url === item.url) === index,
  );
  return result;
}
