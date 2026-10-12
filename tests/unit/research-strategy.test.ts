import { expect, it } from "vitest";
import { research } from "@/lib/investment";
import {
  finishStrategy,
  readStrategy,
  researchSegments,
  segmentContains,
  selectStrategy,
} from "@/lib/research/strategy";
const now = new Date("2026-10-09T21:05:00Z");
it("teyitsiz Değirmenköy örneklemi merkez konut stratejisini değiştirmez", () => {
  const plan = selectStrategy([], research, now);
  expect(plan.segmentId).toBe("CENTRAL_HOME");
  expect(plan.reason).toContain("segment");
  expect(plan.changedFrom).toBeNull();
});
it("sonuçsuz tur hafızasını yeniden yükler; sonraki segmenti seçer, kalite eşiğini düşürmez", () => {
  const empty = { ...research, candidates: [] };
  const plan = selectStrategy([], empty, now);
  const finished = finishStrategy(plan, empty, now, 0);
  const stored = JSON.parse(JSON.stringify({ strategy: finished }));
  expect(readStrategy(stored)?.memory.CENTRAL_HOME).toMatchObject({
    attempts: 1,
    emptyRounds: 1,
    eligibleCandidates: 0,
  });
  expect(
    selectStrategy([{ summary: stored, status: "PARTIAL" }], empty, now)
      .segmentId,
  ).toBe("SILIVRI_LAND");
  expect(finished.memory.CENTRAL_HOME?.missing.join(" ")).toContain(
    "beş bağımsız",
  );
});
it("tüm sonuçsuz segmentler beklemedeyken ağ turu önermez; süre dolunca yeniden araştırır", () => {
  const empty = { ...research, candidates: [] };
  let plan = selectStrategy([], empty, now);
  for (let i = 0; i < researchSegments.length; i++) {
    const finished = finishStrategy(plan, empty, now, 0);
    plan = selectStrategy(
      [{ summary: { strategy: finished }, status: "COMPLETED" }],
      empty,
      now,
    );
  }
  expect(plan.deferredUntil).toBe("2026-10-10T03:05:00.000Z");
  expect(
    selectStrategy(
      [{ summary: { strategy: plan }, status: "COMPLETED" }],
      empty,
      new Date("2026-10-10T04:05:00Z"),
    ).deferredUntil,
  ).toBeNull();
});
it("kaynak hatası altı saat bekler; ilan fiyatı veya fırsat sonucu üretmez", () => {
  const plan = selectStrategy([], research, now);
  const completed = finishStrategy(plan, research, now, 0, true);
  expect(completed.memory.CENTRAL_HOME?.missing).toContain(
    "Kaynak/çalışma hatası",
  );
  expect(completed.memory.CENTRAL_HOME?.retryAfter).toBe(
    "2026-10-10T03:05:00.000Z",
  );
});
it("aynı mahallede dahi 2+1 daire ile villa/3+1 farklı segment kalır", () => {
  const home = {
    ...research.candidates[0],
    category: "EV",
    neighborhood: "Yeni Mahalle",
    rooms: "2+1",
    propertyType: "Daire",
  };
  expect(segmentContains(researchSegments[2], home)).toBe(true);
  expect(
    segmentContains(researchSegments[2], { ...home, propertyType: "Villa" }),
  ).toBe(false);
  expect(segmentContains(researchSegments[2], { ...home, rooms: "3+1" })).toBe(
    false,
  );
});
it("SUV sınıflandırması model adına dayanmaz; gövde kanıtı ve Marmara konumu gerekir", () => {
  const car = {
    ...research.candidates[0],
    category: "ARABA",
    province: "Bursa",
    vehicle: { model: "T10X", bodyType: "SUV", bodyTypeVerified: false },
  };
  expect(segmentContains(researchSegments[4], car)).toBe(false);
  const verified = {
    ...car,
    vehicle: {
      ...car.vehicle,
      bodyTypeVerified: true,
      bodyTypeEvidence: "Kaynak gövde tipi alanı: SUV",
    },
  };
  expect(segmentContains(researchSegments[4], verified)).toBe(true);
  expect(
    segmentContains(researchSegments[4], { ...verified, province: "Ankara" }),
  ).toBe(false);
});
