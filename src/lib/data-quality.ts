// Page access, publication, verified price and verified availability are distinct.
// A timestamp or HTTP 200 alone is never market evidence.
export type QualityFields = {
  publishedAt?: string | Date | null;
  sourceUpdatedAt?: string | Date | null;
  pageCheckedAt?: string | Date | null;
  priceVerifiedAt?: string | Date | null;
  priceVerification?: string;
  availabilityStatus?: string;
  availabilityVerifiedAt?: string | Date | null;
  verificationEvidence?: unknown;
};
type Input = QualityFields & {
  externalId?: string | null;
  sourceUrl?: string | null;
  price?: unknown;
  identityReviewRequired?: boolean;
  identityStatus?: string;
  pageStatus?: string;
};
export const qualityLabels = {
  CONFIRMED_CURRENT: "Güncel ilan ve fiyat teyidi var",
  PAGE_SEEN_UNCONFIRMED: "Sayfa yeniden görüldü; satış/fiyat teyidi yok",
  HISTORICAL: "Eski ilan / arşiv",
  UNAVAILABLE: "Kaldırılmış veya erişilemeyen ilan",
} as const;
const time = (v: string | Date | null | undefined) =>
  v == null ? NaN : new Date(v).getTime();
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const moneyKey = (v: unknown) => {
  const s = String(v);
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(s) || !/[1-9]/.test(s)) return null;
  const [whole, fraction = ""] = s.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
};
export function dataQuality(input: Input, now = new Date()) {
  const fresh = (v: string | Date | null | undefined, days = 7) => {
    const age = now.getTime() - time(v);
    return Number.isFinite(age) && age >= 0 && age <= days * 86400_000;
  };
  const proof = record(input.verificationEvidence);
  const check = (
    kind: "price" | "availability",
    date: string | Date | null | undefined,
  ) => {
    const evidence = record(proof[kind]);
    return (
      ["AUTHORIZED_FEED", "SELLER_CONFIRMATION"].includes(
        String(evidence.method),
      ) &&
      typeof evidence.reference === "string" &&
      evidence.reference.trim().length >= 8 &&
      !!input.externalId &&
      evidence.externalId === input.externalId &&
      !!input.sourceUrl &&
      evidence.sourceUrl === input.sourceUrl &&
      time(evidence.verifiedAt as string) === time(date) &&
      fresh(date) &&
      (kind === "price"
        ? !!moneyKey(input.price) &&
          moneyKey(evidence.price) === moneyKey(input.price)
        : evidence.status === "ACTIVE")
    );
  };
  const published = time(input.publishedAt);
  const missing: string[] = [];
  if (!input.externalId || !input.sourceUrl)
    missing.push("Orijinal ilan kimliği ve kaynak bağlantısı");
  if (!Number.isFinite(published) || published > now.getTime())
    missing.push("Geçerli özgün yayın tarihi");
  if (!fresh(input.pageCheckedAt)) missing.push("Güncel kaynak gözlem zamanı");
  if (
    input.priceVerification !== "VERIFIED" ||
    !check("price", input.priceVerifiedAt)
  )
    missing.push("İlan ve fiyatla eşleşen tarihli fiyat teyidi");
  if (
    input.availabilityStatus !== "ACTIVE" ||
    !check("availability", input.availabilityVerifiedAt)
  )
    missing.push("İlana özgü tarihli satış mevcudiyeti teyidi");
  if (
    input.identityReviewRequired ||
    (input.identityStatus && input.identityStatus !== "ACTIVE")
  )
    missing.push("Çözümlenmiş bağımsız ilan kimliği");
  const unavailable =
    ["REMOVED", "SOLD", "INACTIVE"].includes(input.availabilityStatus ?? "") ||
    [
      "ACCESS_BLOCKED",
      "FAILED",
      "ROBOTS_DENIED",
      "RUN_FAILED",
      "UNSUPPORTED",
    ].includes(input.pageStatus ?? "");
  const old =
    Number.isFinite(published) && now.getTime() - published > 90 * 86400_000;
  const status: keyof typeof qualityLabels = unavailable
    ? "UNAVAILABLE"
    : !missing.length
      ? "CONFIRMED_CURRENT"
      : old || !fresh(input.pageCheckedAt)
        ? "HISTORICAL"
        : "PAGE_SEEN_UNCONFIRMED";
  return {
    status,
    label: qualityLabels[status],
    eligible: status === "CONFIRMED_CURRENT",
    missing,
  };
}
