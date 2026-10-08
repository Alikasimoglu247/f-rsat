import { createHash } from "node:crypto";
import { simpleParser } from "mailparser";
import * as cheerio from "cheerio";
import { listingSchema, priceSchema } from "../validation";
import type { ListingInput } from "../validation";
import { provinces } from "../constants";

export const PARSER_VERSION = "conservative-cards-v1";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type EmailProposal = {
  providerId: string;
  templateId: string;
  fields: Partial<ListingInput>;
  missing: string[];
  warnings: string[];
};
export type ParsedNotification = {
  sender: string;
  subject: string;
  receivedAt: Date | null;
  contentHash: string;
  proposals: EmailProposal[];
  errors: string[];
};
const clean = (value: string) =>
  value
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .trim();
export function turkishPrice(value: string) {
  const normalized = value
    .trim()
    .replace(/^₺\s*/, "")
    .replace(/\s*(?:TL|TRY|₺)$/i, "");
  if (!/^(?:\d{1,3}(?:[. ]\d{3})+|\d+)(?:,\d{1,2})?$/.test(normalized))
    return undefined;
  const price = normalized.replace(/[. ]/g, "").replace(",", ".");
  return priceSchema.safeParse(price).success ? price : undefined;
}
export function listingReference(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let providerId: string, externalId: string | undefined;
    if (host === "sahibinden.com") {
      providerId = "sahibinden-email";
      externalId = url.pathname.match(
        /^\/ilan\/.*-(\d{6,15})(?:\/detay)?\/?$/,
      )?.[1];
    } else if (host === "arabam.com") {
      providerId = "arabam-email";
      externalId = url.pathname.match(/^\/ilan\/.+\/(\d{5,15})\/?$/)?.[1];
    } else return null;
    if (!externalId) return null;
    url.search = "";
    url.hash = "";
    return {
      providerId,
      externalId,
      sourceUrl: url.toString(),
      path: decodeURIComponent(url.pathname),
    };
  } catch {
    return null;
  }
}
function labelled(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .match(
      new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*:\\s*([^\\n]+)`, "iu"),
    )?.[1]
    ?.trim();
}
function proposal(
  text: string,
  link: string,
  title: string,
  shape: string,
  sender: string,
): EmailProposal | null {
  const ref = listingReference(link);
  if (!ref) return null;
  const warnings: string[] = [];
  const prices = [
    ...text.matchAll(
      /(?<![\d.,\p{L}+-])(?:\d{1,3}(?:[. ]\d{3})+|\d+)(?:,\d{1,2})?\s*(?:TL\b|TRY\b|₺)(?![\p{L}\d])/giu,
    ),
  ]
    .map((match) => turkishPrice(match[0]))
    .filter((price): price is string => !!price);
  const uniquePrices = [...new Set(prices)];
  if (/(?:USD\b|EUR\b|\$|€)/iu.test(text)) {
    uniquePrices.length = 0;
    warnings.push(
      "Farklı para birimi var; döviz dönüşümü veya fiyat seçimi yapılmadı.",
    );
  }
  if (uniquePrices.length > 1)
    warnings.push("Birden fazla fiyat var; güncel fiyat otomatik seçilmedi.");
  const categoryLabel = labelled(text, "Kategori")?.toLocaleLowerCase("tr-TR");
  const categories: Record<string, ListingInput["category"]> = {
    ev: "EV",
    konut: "EV",
    araba: "ARABA",
    otomobil: "ARABA",
    arsa: "ARSA",
    tarla: "TARLA",
  };
  const pathCategory = /emlak-konut/.test(ref.path)
    ? "EV"
    : /vasita-otomobil|ikinci-el[/-]otomobil/.test(ref.path)
      ? "ARABA"
      : /emlak-arsa/.test(ref.path)
        ? "ARSA"
        : /emlak-tarla/.test(ref.path)
          ? "TARLA"
          : undefined;
  const labelCategory = categoryLabel ? categories[categoryLabel] : undefined;
  const conflictingCategory = !!(
    pathCategory &&
    labelCategory &&
    pathCategory !== labelCategory
  );
  if (conflictingCategory) warnings.push("URL ve kategori etiketi çelişiyor.");
  const category = conflictingCategory
    ? undefined
    : (labelCategory ?? pathCategory);
  const location = labelled(text, "Konum") ?? labelled(text, "Lokasyon");
  const segments = location?.split(/\s*[/|>]\s*/).map(clean);
  const city = labelled(text, "İl") ?? segments?.[0];
  const province = provinces.find(
    (p) => p.toLocaleLowerCase("tr-TR") === city?.toLocaleLowerCase("tr-TR"),
  );
  const district = labelled(text, "İlçe") ?? segments?.[1];
  const fields: Partial<ListingInput> = {
    sourceUrl: ref.sourceUrl,
    externalId: ref.externalId,
    isDemo: false,
    ...(category ? { category } : {}),
    ...(province ? { province } : {}),
    ...(district ? { district } : {}),
    ...(segments?.[2] ? { neighborhood: segments[2] } : {}),
    ...(uniquePrices.length === 1 ? { price: uniquePrices[0] } : {}),
  };
  const explicitTitle =
    labelled(text, "Başlık") ?? labelled(text, "İlan başlığı");
  const heading = clean(explicitTitle ?? title);
  if (
    heading.length >= 5 &&
    heading.length <= 180 &&
    !/^(ilanı? (görüntüle|incele)|detay|tıkla)/i.test(heading)
  )
    fields.title = heading;
  const optional: [keyof ListingInput, string][] = [
    ["neighborhood", "Mahalle"],
    ["transactionType", "İşlem"],
    ["bodyType", "Gövde tipi"],
    ["netM2", "Net m²"],
    ["grossM2", "Brüt m²"],
    ["sharedOwnership", "Hisse durumu"],
    ["make", "Marka"],
    ["model", "Model"],
    ["trim", "Donanım"],
    ["modelYear", "Yıl"],
    ["mileage", "Kilometre"],
    ["fuel", "Yakıt"],
    ["transmission", "Vites"],
    ["damageHistory", "Hasar geçmişi"],
    ["sizeM2", "Alan"],
    ["propertyType", "Konut tipi"],
    ["rooms", "Oda"],
    ["buildingAge", "Bina yaşı"],
    ["condition", "Durum"],
    ["classification", "Arazi sınıfı"],
    ["zoning", "İmar"],
    ["roadAccess", "Yol erişimi"],
    ["parcelNumber", "Ada/parsel"],
  ];
  for (const [key, label] of optional) {
    const value = labelled(text, label);
    if (!value) continue;
    const field = listingSchema.shape[key];
    const integerText = value.replace(/\s*(?:km|yaş|yıl)$/iu, "");
    const result = field.safeParse(
      ["sizeM2", "netM2", "grossM2"].includes(key)
        ? turkishPrice(value.replace(/\s*m[²2]$/i, ""))
        : ["mileage", "modelYear", "buildingAge"].includes(key)
          ? /^(?:\d{1,3}(?:[. ]\d{3})+|\d+)$/.test(integerText)
            ? integerText.replace(/[. ]/g, "")
            : undefined
          : value,
    );
    if (result.success && result.data !== undefined)
      Object.assign(fields, { [key]: result.data });
    else warnings.push(`${label} ayrıştırılamadı; değer atanmadı.`);
  }
  const result = listingSchema.safeParse(fields);
  const missing = result.success
    ? []
    : [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
  // Scope approval to provider, sender, parser and card structure/field labels, never to the entire mailbox.
  const labels = text
    .split("\n")
    .map((line) => line.match(/^\s*([^:]{1,40}):/)?.[1]?.trim())
    .filter(Boolean)
    .join("|");
  const templateId = digest(
    `${PARSER_VERSION}|${ref.providerId}|${sender}|${category ?? "unknown"}|${shape}|${labels}`,
  );
  return { providerId: ref.providerId, templateId, fields, missing, warnings };
}
export async function parseEml(raw: Buffer): Promise<ParsedNotification> {
  if (!raw.length || raw.length > 2_000_000)
    throw new Error("EML dosyası 2 MB sınırında olmalı.");
  const mail = await simpleParser(raw, {
    skipHtmlToText: true,
    skipTextToHtml: true,
    skipImageLinks: true,
  });
  const sender =
    mail.from?.value.length === 1
      ? (mail.from.value[0].address?.toLowerCase() ?? "")
      : "";
  const subject = clean(mail.subject ?? "").slice(0, 300);
  const text = clean(mail.text ?? "");
  const html = typeof mail.html === "string" ? mail.html : "";
  const errors: string[] = [],
    proposals: EmailProposal[] = [];
  if (!sender) errors.push("Tek bir gönderici adresi bulunamadı.");
  if (html) {
    const $ = cheerio.load(html);
    $("script,style,iframe,object").remove();
    const seen = new Set<string>();
    $("a[href]").each((_, element) => {
      const anchor = $(element),
        href = anchor.attr("href") ?? "";
      const ref = listingReference(href);
      if (!ref || seen.has(ref.sourceUrl)) return;
      seen.add(ref.sourceUrl);
      const closest = anchor.closest("[data-listing],article,li,tr");
      const card = closest.length ? closest : anchor.parent();
      const cardLinks = new Set(
        card
          .find("a[href]")
          .toArray()
          .map((a) => listingReference($(a).attr("href") ?? "")?.sourceUrl)
          .filter(Boolean),
      );
      if (cardLinks.size !== 1) {
        errors.push(
          "Bir kartta birden fazla ilan var; fiyat/ilan eşleştirmesi belirsiz.",
        );
        return;
      }
      const shape = [
        card[0] && "tagName" in card[0]
          ? `${card[0].tagName}.${card.attr("class") ?? ""}`
          : "",
        ...card
          .find("*")
          .toArray()
          .map(
            (n) =>
              `${"tagName" in n ? n.tagName : ""}.${$(n).attr("class") ?? ""}`,
          ),
      ]
        .join("/")
        .slice(0, 8000);
      const copy = card.clone();
      copy.find("br").replaceWith("\n");
      copy.find("p,div,td,span,h1,h2,h3").append("\n");
      const extracted = proposal(
        clean(copy.text()),
        href,
        anchor.text(),
        shape,
        sender,
      );
      if (extracted) proposals.push(extracted);
    });
  }
  if (!proposals.length && text) {
    for (const block of text.split(/\n\s*\n/)) {
      const links = [
        ...new Set(
          [...block.matchAll(/https:\/\/[^\s<>"']+/g)]
            .map((match) => match[0])
            .filter((link) => listingReference(link)),
        ),
      ];
      if (links.length > 1) {
        errors.push(
          "Metin bloğunda birden fazla ilan var; otomatik eşleştirme yapılmadı.",
        );
        continue;
      }
      if (links.length === 1) {
        const extracted = proposal(
          block,
          links[0],
          "",
          "plain-labelled",
          sender,
        );
        if (extracted) proposals.push(extracted);
      }
    }
  }
  if (!proposals.length)
    errors.push(
      "Desteklenmiş doğrudan ilan bağlantısı/kartı yok; izleme bağlantıları takip edilmez.",
    );
  if (proposals.length > 100)
    throw new Error("Bir e-postada en fazla 100 ilan incelenebilir.");
  const receivedAt =
    mail.date &&
    Number.isFinite(mail.date.getTime()) &&
    mail.date.getTime() <= Date.now() + 300_000
      ? mail.date
      : null;
  return {
    sender,
    subject,
    receivedAt,
    contentHash: digest(
      `${sender}|${mail.messageId ?? ""}|${mail.date && Number.isFinite(mail.date.getTime()) ? mail.date.toISOString() : ""}|${subject}|${text}|${html}`,
    ),
    proposals,
    errors,
  };
}
