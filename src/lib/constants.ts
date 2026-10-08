export const provinces = [
  "İstanbul",
  "Tekirdağ",
  "Edirne",
  "Kırklareli",
  "Kocaeli",
  "Sakarya",
  "Yalova",
  "Bursa",
  "Balıkesir",
  "Çanakkale",
  "Bilecik",
] as const;
export const categoryLabels = {
  EV: "Ev",
  ARABA: "Araba",
  ARSA: "Arsa",
  TARLA: "Tarla",
} as const;
export type Category = keyof typeof categoryLabels;
export const categoryKeys = ["EV", "ARABA", "ARSA", "TARLA"] as const;
export const bodyTypes = [
  "SUV",
  "CROSSOVER",
  "SEDAN",
  "HATCHBACK",
  "STATION_WAGON",
  "COUPE",
  "PICKUP",
  "VAN",
] as const;
export const pilotFuels = ["Elektrikli", "Hibrit", "Benzin", "Dizel"] as const;
export const normalizeBodyType = (value?: string | null) => {
  const text = value?.trim().toLocaleUpperCase("en-US");
  return text && bodyTypes.includes(text as (typeof bodyTypes)[number])
    ? text
    : null;
};
export function money(value: string | number | null | undefined) {
  if (value == null) return "—";
  const text = String(value),
    match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match)
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 2,
    }).format(Number(value));
  const integer = new Intl.NumberFormat("tr-TR").format(BigInt(match[1]));
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return `₺${integer}${fraction === "00" ? "" : `,${fraction}`}`;
}
export const dateTime = (value: string | Date | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Istanbul",
      }).format(new Date(value))
    : "Henüz yok";
