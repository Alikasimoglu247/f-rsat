import { it, expect } from "vitest";
import { recentPriceDrops } from "../../src/lib/price-drops";
const now = new Date("2026-10-08T06:00:00Z");
const p = (price: string, days: number) => ({
  price,
  observedAt: new Date(now.getTime() - days * 86400_000),
});
it("ardışık fiyat indiriminde önceki/yeni/tutar/yüzde ve tarihi hesaplar", () => {
  expect(
    recentPriceDrops("l", [p("1000000", 10), p("900000", 2)], now),
  ).toEqual([
    expect.objectContaining({
      listingId: "l",
      previousPrice: "1000000.00",
      newPrice: "900000.00",
      amount: "100000.00",
      percentage: "10.0000",
      observedAt: p("900000", 2).observedAt,
    }),
  ]);
});
it("eski yüksek fiyatı veya aynı fiyatlı yeni gözlemi 7 günlük olay saymaz", () => {
  expect(
    recentPriceDrops("l", [p("100", 30), p("90", 20), p("90", 1)], now),
  ).toEqual([]);
});
it("aynı zaman/fiyat tekrarlarını tek olay yapar; ayrı gerçek indirimleri ayırır", () => {
  const result = recentPriceDrops(
    "l",
    [p("100", 10), p("90", 6), p("90", 6), p("90", 5), p("80", 2), p("80", 2)],
    now,
  );
  expect(result).toHaveLength(2);
  expect(new Set(result.map((r) => r.key)).size).toBe(2);
  expect(result[1].previousPrice).toBe("90.00");
});
it("son indirimi önceki geçerli gözlemle karşılaştırır; geçmiş maksimumunu kullanmaz", () => {
  const result = recentPriceDrops(
    "l",
    [p("200", 20), p("100", 9), p("110", 4), p("105", 1)],
    now,
  );
  expect(result[0]).toMatchObject({
    previousPrice: "110.00",
    newPrice: "105.00",
    amount: "5.00",
    percentage: "4.5455",
  });
});
it("geçersiz/sıfır/gelecek fiyatları atlar; aynı anda çelişen gözlemden indirim üretmez", () => {
  expect(
    recentPriceDrops(
      "l",
      [p("100", 10), p("0", 3), p("bad", 2), p("90", 1), p("80", -1)],
      now,
    ),
  ).toHaveLength(1);
  expect(
    recentPriceDrops(
      "l",
      [p("100", 10), p("80", 3), p("90", 3), p("70", 1)],
      now,
    ),
  ).toEqual([]);
});
it("tam 7 günlük sınırı dahil eder; daha eski olayı dahil etmez", () => {
  expect(recentPriceDrops("l", [p("100", 20), p("90", 7)], now)).toHaveLength(
    1,
  );
  expect(recentPriceDrops("l", [p("100", 20), p("90", 7.001)], now)).toEqual(
    [],
  );
});
