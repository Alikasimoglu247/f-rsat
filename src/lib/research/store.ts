import { db } from "../db";
import {
  research,
  sourceFresh,
  observedUnitPrice,
  type ResearchSnapshot,
} from "../investment";
import type { AcquisitionResult, ResearchChange } from "./types";

const canonical = (url: string) => {
  const value = new URL(url);
  value.hash = "";
  return value.toString();
};
// PostgreSQL JSONB may reorder object keys. Key order is not a market change.
export function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, v]) => [key, normalize(v)]),
      );
    return item;
  };
  return JSON.stringify(normalize(value));
}
export function mergeResearch(
  previous: ResearchSnapshot | null,
  acquired: AcquisitionResult,
  now: Date,
): ResearchSnapshot {
  // The historical pilot is a starting inventory, never a newly fetched observation.
  const base = previous ?? {
    ...research,
    sources: research.sources.map((source) => ({
      ...source,
      checkStatus: "UNVERIFIED",
    })),
  };
  const refreshed = new Set(
    acquired.sources.map((source) => canonical(source.url)),
  );
  const refreshedIds = new Set(acquired.sources.map((source) => source.id));
  const replacedIds = new Set(
    base.sources
      .filter(
        (source) =>
          refreshed.has(canonical(source.url)) || refreshedIds.has(source.id),
      )
      .map((source) => source.id),
  );
  const sources = base.sources
    .filter((source) => !replacedIds.has(source.id))
    .map((source) => ({ ...source }));
  for (const source of acquired.sources) {
    const existing = sources.findIndex((item) => item.id === source.id);
    if (existing >= 0) sources.splice(existing, 1);
    sources.push(source);
  }
  for (const check of acquired.checks) {
    if (["PARSED", "BUDGET_DEFERRED"].includes(check.status)) continue;
    for (const source of sources)
      if (canonical(source.url) === canonical(check.url))
        source.checkStatus = check.status;
  }
  for (const source of sources)
    if (
      [undefined, "VALID", "UNCHANGED"].includes(source.checkStatus) &&
      !sourceFresh(source, now)
    )
      source.checkStatus = "EXPIRED";
  const facts = [
    ...new Map(
      [
        ...base.facts.filter((fact) => !replacedIds.has(fact.sourceId)),
        ...acquired.facts,
      ].map((fact) => [fact.id, fact]),
    ).values(),
  ];
  const candidates = base.candidates.map(
    (candidate) =>
      acquired.candidates.find(
        (item) => canonical(item.sourceUrl) === canonical(candidate.sourceUrl),
      ) ?? candidate,
  );
  for (const candidate of acquired.candidates)
    if (
      !candidates.some(
        (item) => canonical(item.sourceUrl) === canonical(candidate.sourceUrl),
      )
    )
      candidates.push(candidate);
  return {
    ...base,
    researchedAt: now.toISOString(),
    sources,
    facts,
    candidates,
    // Keep declared dependencies so a later successful recheck can restore them.
    // The report gates their display on current evidence instead of erasing IDs.
    neighborhoods: base.neighborhoods,
    strategies: base.strategies,
  };
}

const factValue = (fact: ResearchSnapshot["facts"][number]) =>
  JSON.stringify({
    value: fact.value,
    period: fact.period,
    unit: fact.unit,
    text: fact.text ?? null,
  });
const candidateValue = (candidate: ResearchSnapshot["candidates"][number]) =>
  stableJson({
    ...candidate,
    observedAt: undefined,
    factIds: undefined,
    sourceId: undefined,
    identityReviewRequired: undefined,
    reviewReasons: undefined,
  });
export function researchChanges(
  previous: ResearchSnapshot | null,
  next: ResearchSnapshot,
  now: Date,
): ResearchChange[] {
  const changes: ResearchChange[] = [];
  for (const candidate of next.candidates) {
    const source = next.sources.find((item) => item.id === candidate.sourceId);
    if (!source || !sourceFresh(source, now)) continue;
    const old = previous?.candidates.find(
      (item) => canonical(item.sourceUrl) === canonical(candidate.sourceUrl),
    );
    if (!old)
      changes.push({
        kind: "NEW_CANDIDATE",
        key: candidate.sourceUrl,
        before: null,
        after: candidate.price,
        reason:
          "Bu çalışmada kaynak sayfasından yeni bir gerçek aday ayrıştırıldı; satış mevcudiyeti belgeyle teyit edilmedi.",
      });
    else {
      if (old.price !== candidate.price) {
        const pricesValid =
          !!observedUnitPrice(old.price, "1") &&
          !!observedUnitPrice(candidate.price, "1");
        changes.push({
          kind: pricesValid ? "PRICE_CHANGED" : "CANDIDATE_CHANGED",
          key: candidate.sourceUrl,
          before: old.price,
          after: candidate.price,
          reason: pricesValid
            ? "Aynı kaynak/ilan kimliğinin ardışık geçerli fiyat gözlemleri değişti."
            : "Fiyat artık açıklanmıyor veya geçerli pozitif sayıya dönüşmüyor; önceki fiyat yeni gözlem olarak kopyalanmadı.",
        });
      } else if (candidateValue(old) !== candidateValue(candidate))
        changes.push({
          kind: "CANDIDATE_CHANGED",
          key: candidate.sourceUrl,
          before: candidateValue(old),
          after: candidateValue(candidate),
          reason:
            "Kaynağın özellik veya risk beyanı değişti; hukuki doğrulama olarak kabul edilmedi.",
        });
    }
  }
  for (const fact of next.facts) {
    const source = next.sources.find((item) => item.id === fact.sourceId);
    if (!source || !sourceFresh(source, now)) continue;
    const old = previous?.facts.find((item) => item.id === fact.id);
    if (old && factValue(old) !== factValue(fact))
      changes.push({
        kind: "FACT_CHANGED",
        key: fact.id,
        before: factValue(old),
        after: factValue(fact),
        reason:
          "Resmî veya yayıncı kanıtının değeri/dönemi/beyanı değişti; bağlı gerekçeler yeniden hesaplandı.",
      });
  }
  for (const source of next.sources) {
    const old = previous?.sources.find(
      (item) => canonical(item.url) === canonical(source.url),
    );
    if (
      old &&
      [undefined, "VALID", "UNCHANGED"].includes(old.checkStatus) &&
      !sourceFresh(source, now)
    )
      changes.push({
        kind: "SOURCE_INVALIDATED",
        key: source.url,
        before: old.checkStatus ?? "VALID",
        after: source.checkStatus ?? "EXPIRED",
        reason:
          "Son erişim/ayrıştırma kontrolü başarısız veya kanıt süresi doldu; önceki gözlem karar desteğinden çıkarıldı.",
      });
  }
  return changes;
}

export async function loadResearchState() {
  const history = await db.researchRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 5,
  });
  const latestRun = history.find((run) => run.status !== "RUNNING") ?? null;
  const resources = await db.researchResource.findMany({
    orderBy: { discoveredAt: "asc" },
  });
  return {
    snapshot: latestRun
      ? (latestRun.snapshot as unknown as ResearchSnapshot)
      : research,
    latestRun,
    history,
    resources,
  };
}
