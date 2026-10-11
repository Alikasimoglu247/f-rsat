import { comparablePrice, type Evidence } from "./analysis";
import type { Decision } from "./investment";
export function comparisonWarnings(
  items: Evidence[],
  decisions: Pick<Decision, "id" | "priceCurrent" | "assessment">[],
  now = new Date(),
) {
  const warnings = new Set<string>();
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i],
        b = items[j];
      if (a.category !== b.category)
        warnings.add("Farklı kategoriler doğrudan fiyat emsali sayılamaz.");
      else if (!comparablePrice(a, b, now))
        warnings.add(
          a.category === "ARABA"
            ? "Marka, model, donanım, yıl, kilometre veya hasar bilgisi eşleşmiyor / eksik. Bu araçlar fiyat emsali değildir."
            : "Mahalle, alan, hukuki sınıf, imar, tapu veya yol kanıtları eşleşmiyor / eksik. Bu taşınmazlar fiyat emsali değildir.",
        );
      if (a.land?.parcelNumber && a.land.parcelNumber === b.land?.parcelNumber)
        warnings.add(
          "Aynı ada/parsel beyanı: bağımsız taşınmaz oldukları doğrulanmadı; mükerrer emsal olarak sayılmaz.",
        );
    }
  if (items.some((l) => !decisions.find((d) => d.id === l.id)?.priceCurrent))
    warnings.add(
      "En az bir adayın kaynak / fiyat gözlemi güncel veya uzlaştırılmış değil.",
    );
  if (
    items.some(
      (l) =>
        (decisions.find((d) => d.id === l.id)?.assessment?.sampleCount ?? 0) <
        5,
    )
  )
    warnings.add(
      "En az beş bağımsız uygun emsal yok; fiyat avantajı puanı üretilmez.",
    );
  return [...warnings];
}
