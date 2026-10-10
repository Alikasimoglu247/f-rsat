import { db } from "./db";
import {
  canonicalUrl,
  evidence,
  listingInclude,
  type StoredListing,
} from "./listings";
import { matchesProfile } from "./pilots";
import {
  listingDecision,
  candidateLegalVerified,
  verifiedResearchField,
  observedUnitPrice,
  realAnnualChange,
  researchDecision,
  sourceFresh,
  supportedFact,
  type ResearchCandidate,
  type ResearchSnapshot,
} from "./investment";
import { assess } from "./analysis";
import { researchInProfile } from "./research-import";
import { loadResearchState } from "./research/store";
import { researchSchedulerStatus } from "./research/scheduler";
import type { ResearchChange, SourceCheck } from "./research/types";
import { readStrategy } from "./research/strategy";

function jsonRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function count(summary: Record<string, unknown>, key: string) {
  const value = summary[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}
function candidateCurrent(
  candidate: ResearchCandidate,
  snapshot: ResearchSnapshot,
  now: Date,
) {
  const source = snapshot.sources.find(
    (item) => item.id === candidate.sourceId,
  );
  return (
    !!source &&
    source.url === candidate.sourceUrl &&
    source.retrievedAt === candidate.observedAt &&
    sourceFresh(source, now)
  );
}
function urlKey(value: string | null) {
  try {
    return value ? (canonicalUrl(value) ?? null) : null;
  } catch {
    return null;
  }
}
function candidateReconciled(
  candidate: ResearchCandidate,
  listing: StoredListing,
) {
  // The dated Akgün page exposes conflicting 1021/10694 references; the
  // importer intentionally uses its canonical URL until identity is resolved.
  const externalId =
    candidate.externalReferenceConflict || candidate.id === "akgun-3653"
      ? null
      : candidate.externalId;
  return (
    !candidate.identityReviewRequired &&
    candidate.category === listing.category &&
    !!observedUnitPrice(candidate.price, "1") &&
    listing.price.eq(candidate.price!) &&
    (!externalId || externalId === listing.externalId)
  );
}

export async function investmentReport(now = new Date()) {
  const [listings, profiles, state, scheduler] = await Promise.all([
    db.listing.findMany({
      where: { isDemo: false, identityStatus: "ACTIVE" },
      include: listingInclude,
    }),
    db.searchProfile.findMany({
      where: { pilotKey: { in: ["SILIVRI", "MARMARA_SUV"] } },
    }),
    loadResearchState(),
    researchSchedulerStatus(now),
  ]);
  const research = state.snapshot;
  const reports = ["SILIVRI", "MARMARA_SUV"].map((pilotKey) => {
    const profile = profiles.find((item) => item.pilotKey === pilotKey);
    // Existing editable search profiles remain the authority for real database scope.
    const selected = profile
      ? listings.filter((item) => matchesProfile(item, profile))
      : [];
    const candidateFor = (url: string | null) => {
      const key = urlKey(url);
      return key
        ? research.candidates.find(
            (candidate) => urlKey(candidate.sourceUrl) === key,
          )
        : undefined;
    };
    const pool = selected
      .filter((item) => {
        if (item.source.method !== "PUBLIC_RESEARCH") return true;
        const candidate = candidateFor(item.sourceUrl);
        return (
          !!candidate &&
          candidateReconciled(candidate, item) &&
          candidateCurrent(candidate, research, now) &&
          candidateLegalVerified(candidate, now, research) &&
          verifiedResearchField(candidate, "availability", now, research)
        );
      })
      .map(evidence);
    const stored = selected.flatMap((item) => {
      // Identity follows the source URL even when a new observation changes price.
      const candidate = candidateFor(item.sourceUrl);
      if (candidate) {
        const reconciled = candidateReconciled(candidate, item);
        const decision = researchDecision(
          candidate,
          now,
          reconciled ? assess(evidence(item), pool, now) : null,
          research,
        );
        return [
          {
            ...decision,
            id: item.id,
            origin: "DATABASE" as const,
            ...(reconciled
              ? {}
              : {
                  title: item.title,
                  category: item.category,
                  price: item.price.toFixed(2),
                  observedAt: item.lastObservedAt.toISOString(),
                  location: [item.province, item.district, item.neighborhood]
                    .filter(Boolean)
                    .join(" / "),
                  features: [],
                  unitPrice: null,
                  verdict: "Yetersiz veri" as const,
                  assessment: null,
                  whyCould: [],
                  missing: [
                    "Kaynak kimliği, kategori ve güncel fiyat veritabanı kaydıyla uzlaştırılamadı; inceleme gerekli.",
                    ...decision.missing,
                  ],
                }),
            priceCurrent:
              reconciled && candidateCurrent(candidate, research, now),
          },
        ];
      }
      const decision = listingDecision(
        evidence(item),
        pool,
        item.sourceUrl,
        now,
      );
      if (!decision) return [];
      return item.source.method === "PUBLIC_RESEARCH"
        ? [
            {
              ...decision,
              verdict: "Yetersiz veri" as const,
              assessment: null,
              whyCould: [],
              unitPrice: null,
              priceCurrent: false,
              missing: [
                "Bu kaydın güncel ve izinli araştırma kanıtı doğrulanamadı.",
                ...decision.missing,
              ],
            },
          ]
        : [{ ...decision, priceCurrent: true }];
    });
    const researched = profile
      ? research.candidates
          .filter((item) => researchInProfile(item, profile))
          .map((item) => {
            const decision = researchDecision(item, now, null, research);
            return {
              ...decision,
              priceCurrent:
                !item.identityReviewRequired &&
                candidateCurrent(item, research, now),
              ...(item.identityReviewRequired
                ? {
                    missing: [
                      "İlan kimliği/fiyat çelişkisi için inceleme ve veritabanı uzlaştırması gerekli.",
                      ...decision.missing,
                    ],
                  }
                : {}),
            };
          })
      : [];
    // A research page is not a priced database listing. Do not merge/count it twice.
    const unique = researched.filter(
      (candidate) =>
        !stored.some(
          (item) => urlKey(item.sourceUrl) === urlKey(candidate.sourceUrl),
        ),
    );
    const decisions = [...stored, ...unique];
    return {
      pilotKey,
      name:
        profile?.name ??
        (pilotKey === "SILIVRI" ? "Silivri Gayrimenkul" : "Marmara SUV"),
      profileMissing: !profile,
      databaseCount: selected.length,
      researchCount: researched.length,
      pricedCount: decisions.filter((item) => item.price != null).length,
      analyzedCount: decisions.length,
      comparableSupported: stored.filter(
        (item) => item.priceCurrent && item.assessment?.score != null,
      ).length,
      reviewCount: decisions.filter(
        (item) => item.verdict === "İncelemeye değer",
      ).length,
      decisions,
    };
  });
  const history = state.history.slice(0, 5).map((run) => {
    const summary = jsonRecord(run.summary);
    const changes = Array.isArray(run.changes)
      ? run.changes.filter((value): value is ResearchChange => {
          const item = jsonRecord(value);
          return (
            typeof item.kind === "string" &&
            typeof item.key === "string" &&
            typeof item.reason === "string"
          );
        })
      : [];
    const checks = Array.isArray(run.checks)
      ? run.checks.filter((value): value is SourceCheck => {
          const item = jsonRecord(value);
          return (
            typeof item.url === "string" &&
            typeof item.status === "string" &&
            typeof item.checkedAt === "string"
          );
        })
      : [];
    return {
      id: run.id,
      status: run.status,
      trigger: run.trigger,
      segment: run.segment,
      strategy: readStrategy(summary),
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      checkedUrls: count(summary, "checkedUrls"),
      fetchedChecks: checks.filter((item) => !!item.sha256).length,
      parsedSources: count(summary, "parsedSources"),
      newSourceUrls: count(summary, "newSourceUrls"),
      newCandidates: count(summary, "newCandidates"),
      inserted: count(summary, "inserted"),
      updated: count(summary, "updated"),
      priceChanges: count(summary, "priceChanges"),
      factChanges: count(summary, "factChanges"),
      decisionRevisions: count(summary, "decisionRevisions"),
      invalidatedSources: count(summary, "invalidatedSources"),
      unchangedCandidates: count(summary, "unchangedCandidates"),
      changes,
      checks,
    };
  });
  const nominal = supportedFact("housing-istanbul", now, research);
  const inflation = nominal
    ? (research.facts.find(
        (fact) =>
          fact.id.startsWith("cpi-") &&
          fact.unit === "%" &&
          fact.period === nominal.period &&
          supportedFact(fact.id, now, research),
      ) ?? null)
    : null;
  return {
    evaluatedAt: now.toISOString(),
    researchedAt: research.researchedAt,
    sources: research.sources.map((source) => ({
      ...source,
      fresh: sourceFresh(source, now),
    })),
    facts: research.facts.map((fact) => ({
      ...fact,
      current: !!supportedFact(fact.id, now, research),
    })),
    neighborhoods: research.neighborhoods.map((item) => ({
      ...item,
      finding:
        item.name === "Değirmenköy"
          ? `${
              research.candidates.filter(
                (candidate) =>
                  candidate.neighborhood === "Değirmenköy" &&
                  candidate.price != null &&
                  candidateCurrent(candidate, research, now),
              ).length
            } güncel kaynak gözlemi fiyat içeriyor. Hisse, imar ve arazi türleri eşleşmeden mahalle ortalaması veya ortak emsal medyanı hesaplanmaz.`
          : item.finding,
      current:
        item.evidenceIds.length > 0 &&
        item.evidenceIds.every((id) => !!supportedFact(id, now, research)),
    })),
    strategies: research.strategies.map((item) => ({
      ...item,
      current:
        item.evidenceIds.length > 0 &&
        item.evidenceIds.every((id) => !!supportedFact(id, now, research)),
    })),
    excludedSources: research.excludedSources,
    istanbulRealChange: realAnnualChange(nominal, inflation),
    realChangeFactIds: [nominal?.id, inflation?.id].filter(
      (id): id is string => !!id,
    ),
    researchLoop: {
      mode: state.latestRun ? "PERSISTED_RESEARCH" : "LEGACY_SNAPSHOT",
      history,
      scheduler,
      dailyRunCount: state.history.filter(
        (run) =>
          run.trigger === "SCHEDULED" &&
          ["SUCCEEDED", "COMPLETED", "PARTIAL"].includes(run.status),
      ).length,
      blockedResourceCount: state.resources.filter((resource) =>
        ["ACCESS_BLOCKED", "ROBOTS_DENIED", "POLICY_REVIEW"].includes(
          resource.state,
        ),
      ).length,
    },
    pilots: reports,
  };
}
export type InvestmentReport = Awaited<ReturnType<typeof investmentReport>>;
