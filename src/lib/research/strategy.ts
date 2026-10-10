import {
  candidateLegalVerified,
  researchCandidateFresh,
  verifiedResearchField,
  type ResearchCandidate,
  type ResearchSnapshot,
} from "../investment";
import { provinces } from "../constants";

export const researchSegments = [
  {
    id: "DEGIRMENKOY_LAND",
    label:
      "Değirmenköy · 200–400 m² satılık arsa/tarla; tapu ve imar sınıfları ayrı",
    neighborhoods: ["Değirmenköy"],
    categories: ["ARSA", "TARLA"],
    rooms: null,
  },
  {
    id: "SELIMPASA_HOME",
    label: "Selimpaşa · satılık 2+1 daire",
    neighborhoods: ["Selimpaşa"],
    categories: ["EV"],
    rooms: "2+1",
  },
  {
    id: "CENTRAL_HOME",
    label:
      "Silivri merkez · Yeni, Alibey, Mimarsinan, Cumhuriyet · 2+1 daire; mahalleler ayrı",
    neighborhoods: [
      "Yeni",
      "Yenimahalle",
      "Alibey",
      "Mimarsinan",
      "Cumhuriyet",
    ],
    categories: ["EV"],
    rooms: "2+1",
  },
  {
    id: "SILIVRI_LAND",
    label:
      "Ortaköy, Gümüşyaka, Çanta · satılık arazi; mahalle, tür, imar ve hisse sınıfları ayrı",
    neighborhoods: ["Ortaköy", "Gümüşyaka", "Çanta"],
    categories: ["ARSA", "TARLA"],
    rooms: null,
  },
  {
    id: "MARMARA_SUV",
    label:
      "Marmara'nın 11 ili · SUV/Crossover; marka, model, donanım ve kondisyon ayrı",
    neighborhoods: [],
    categories: ["ARABA"],
    rooms: null,
  },
  {
    id: "CENTRAL_THREE_ROOM",
    label: "Silivri merkez · 3+1 daire; mahalleler ayrı",
    neighborhoods: [
      "Yeni",
      "Yenimahalle",
      "Alibey",
      "Mimarsinan",
      "Cumhuriyet",
    ],
    categories: ["EV"],
    rooms: "3+1",
  },
] as const;
export type ResearchSegment = (typeof researchSegments)[number];
export type SegmentId = ResearchSegment["id"];
const norm = (s: string) =>
  s
    .normalize("NFC")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s*(?:mahallesi|mahalle|mah\.?|köyü)\s*$/u, "")
    .trim();
export function segmentContains(
  segment: ResearchSegment,
  c: ResearchCandidate,
) {
  if (!(segment.categories as readonly string[]).includes(c.category))
    return false;
  if (segment.id === "MARMARA_SUV")
    return (
      !!c.vehicle?.bodyTypeVerified &&
      !!c.vehicle.bodyTypeEvidence &&
      provinces.some((p) => norm(p) === norm(c.province)) &&
      /^(SUV|CROSSOVER)$/i.test(c.vehicle.bodyType ?? "")
    );
  if (norm(c.district) !== "silivri" || norm(c.province) !== "istanbul")
    return false;
  if (!segment.neighborhoods.some((n) => norm(n) === norm(c.neighborhood)))
    return false;
  if (
    segment.rooms &&
    (c.rooms !== segment.rooms || c.propertyType !== "Daire")
  )
    return false;
  return (
    segment.id !== "DEGIRMENKOY_LAND" ||
    (!!c.sizeM2 && Number(c.sizeM2) >= 200 && Number(c.sizeM2) <= 400)
  );
}
export type SegmentMemory = {
  attempts: number;
  emptyRounds: number;
  lastRunAt: string;
  retryAfter: string;
  freshCandidates: number;
  eligibleCandidates: number;
  duplicateCandidates: number;
  missing: string[];
};
export type StrategyRecord = {
  version: 1;
  segmentId: SegmentId;
  reason: string;
  changedFrom: SegmentId | null;
  memory: Partial<Record<SegmentId, SegmentMemory>>;
  deferredUntil: string | null;
};
export function readStrategy(summary: unknown): StrategyRecord | null {
  if (!summary || typeof summary !== "object" || !("strategy" in summary))
    return null;
  const s = summary.strategy as StrategyRecord;
  return s?.version === 1 &&
    researchSegments.some((x) => x.id === s.segmentId) &&
    s.memory &&
    typeof s.memory === "object"
    ? s
    : null;
}

/** Rotation follows observed information gaps, not prices or an invented profit score. */
export function selectStrategy(
  history: { summary: unknown; status: string }[],
  snapshot: ResearchSnapshot,
  now: Date,
  requested?: SegmentId,
): StrategyRecord {
  const previous =
    history.map((h) => readStrategy(h.summary)).find(Boolean) ?? null;
  const memory = structuredClone(previous?.memory ?? {});
  const priorId = previous?.segmentId ?? "DEGIRMENKOY_LAND";
  const freshLand = snapshot.candidates.filter(
    (c) =>
      segmentContains(researchSegments[0], c) &&
      researchCandidateFresh(c, now, snapshot),
  );
  const landBlocked =
    freshLand.length > 0 &&
    freshLand.every((c) => !candidateLegalVerified(c, now, snapshot));
  const start = previous
    ? (researchSegments.findIndex((s) => s.id === priorId) + 1) %
      researchSegments.length
    : landBlocked
      ? 1
      : 0;
  const ordered = [
    ...researchSegments.slice(start),
    ...researchSegments.slice(0, start),
  ];
  const chosen = requested
    ? researchSegments.find((s) => s.id === requested)!
    : ordered.find(
        (s) =>
          !memory[s.id] ||
          Date.parse(memory[s.id]!.retryAfter) <= now.getTime(),
      );
  if (!chosen) {
    const until = Object.values(memory)
      .map((m) => m!.retryAfter)
      .sort()[0];
    return {
      version: 1,
      segmentId: priorId,
      changedFrom: null,
      reason:
        "Tüm segmentler bekleme aralığında; aynı sonuçsuz kaynaklar tekrar sorgulanmayacak.",
      memory,
      deferredUntil: until,
    };
  }
  const old = memory[priorId];
  const reason = requested
    ? "Açıkça seçilen segment; kaynak erişim ve emsal kalite kontrolleri korunur."
    : previous
      ? `${old?.freshCandidates ?? 0} güncel aday, ${old?.eligibleCandidates ?? 0} kanıt bakımından uygun aday; ${old?.missing.join(", ") || "emsal kanıtı eksik"}. ${researchSegments.find((s) => s.id === priorId)!.label} sonrasında ${chosen.label} araştırılacak. Bu yön değişimi yatırım tavsiyesi değildir.`
      : landBlocked
        ? "Değirmenköy örnekleminin imar/tapu kanıtları karşılaştırmayı desteklemiyor; Selimpaşa konutlarında yeni kanıt aranacak."
        : "İlk dar segmentin veri, kimlik ve hukuki kanıt kapsamı ölçülecek.";
  return {
    version: 1,
    segmentId: chosen.id,
    changedFrom: chosen.id === priorId ? null : priorId,
    reason,
    memory,
    deferredUntil: null,
  };
}
export function finishStrategy(
  plan: StrategyRecord,
  snapshot: ResearchSnapshot,
  now: Date,
  newCandidates: number,
  failed = false,
): StrategyRecord {
  const segment = researchSegments.find((s) => s.id === plan.segmentId)!;
  const fresh = snapshot.candidates.filter(
    (c) =>
      segmentContains(segment, c) && researchCandidateFresh(c, now, snapshot),
  );
  const eligible = fresh.filter(
    (c) =>
      !c.identityReviewRequired &&
      candidateLegalVerified(c, now, snapshot) &&
      verifiedResearchField(c, "availability", now, snapshot),
  );
  const previous = plan.memory[plan.segmentId];
  const emptyRounds =
    newCandidates === 0 ? (previous?.emptyRounds ?? 0) + 1 : 0;
  const cooldownHours = failed
    ? 6
    : newCandidates > 0
      ? 1
      : Math.min(24, 6 * emptyRounds);
  return {
    ...plan,
    memory: {
      ...plan.memory,
      [plan.segmentId]: {
        attempts: (previous?.attempts ?? 0) + 1,
        emptyRounds,
        lastRunAt: now.toISOString(),
        retryAfter: new Date(
          now.getTime() + cooldownHours * 3600_000,
        ).toISOString(),
        freshCandidates: fresh.length,
        eligibleCandidates: eligible.length,
        duplicateCandidates: fresh.filter((c) => c.identityReviewRequired)
          .length,
        missing: [
          ...(failed ? ["Kaynak/çalışma hatası"] : []),
          ...(fresh.length ? [] : ["Güncel segment ilanı yok"]),
          ...(eligible.length < 6
            ? ["En az beş bağımsız benzer emsal ve özne için yeterli kanıt yok"]
            : []),
        ],
      },
    },
  };
}
