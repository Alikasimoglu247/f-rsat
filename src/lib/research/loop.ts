import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  evidence,
  listingInclude,
  importRecords,
  analyzeAll,
  canonicalUrl,
} from "../listings";
import { assess } from "../analysis";
import {
  candidateLegalVerified,
  verifiedResearchField,
  research,
  researchDecision,
  sourceFresh,
  type Decision,
  type ResearchSnapshot,
} from "../investment";
import { researchListingInput } from "../research-import";
import { collectResearch } from "./acquisition";
import { potentialParcelGroups } from "./parcel-review";
import { mergeResearch, researchChanges, stableJson } from "./store";
import type { AcquisitionResult, ResearchTrigger } from "./types";

export const RESEARCH_SEGMENT =
  "İstanbul / Silivri / Değirmenköy · 200–400 m² satılık arsa ve tarla; hukuki sınıflar ayrı";
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
const resourceUrl = (value: string) => canonicalUrl(value)!;
const meaningfulDecision = (decision: Decision) =>
  stableJson({
    verdict: decision.verdict,
    price: decision.price,
    missing: decision.missing,
    whyCould: decision.whyCould,
    whyNot: decision.whyNot,
    alternatives: decision.alternatives,
    score: decision.assessment?.score ?? null,
    sampleCount: decision.assessment?.sampleCount ?? 0,
  });
export type ResearchSummary = {
  checkedUrls: number;
  parsedSources: number;
  newSourceUrls: number;
  newCandidates: number;
  pricedCandidates: number;
  inserted: number;
  updated: number;
  duplicates: number;
  reviewed: number;
  priceChanges: number;
  factChanges: number;
  decisionRevisions: number;
  invalidatedSources: number;
  unchangedCandidates: number;
  engineAnalyzed: number;
  reviewCount: number;
  comparableSupported: number;
};

/** Each call performs new research. A completed manual run is not reused as a cache. */
export async function runResearch(
  options: {
    trigger?: ResearchTrigger;
    pageBudget?: number;
    acquire?: typeof collectResearch;
    now?: Date;
  } = {},
) {
  const now = options.now ?? new Date();
  const claimed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451812)::text`;
    const running = await tx.researchRun.findFirst({
      where: {
        status: "RUNNING",
        startedAt: { gt: new Date(now.getTime() - 30 * 60_000) },
      },
    });
    if (running) return { run: running, claimed: false };
    await tx.researchRun.updateMany({
      where: { status: "RUNNING" },
      data: {
        status: "FAILED",
        completedAt: now,
        summary: {
          reason: "Önceki süreç kesildi; çalışma süresi sınırını aştı.",
        },
      },
    });
    const previous = await tx.researchRun.findFirst({
      where: { status: { not: "RUNNING" } },
      orderBy: { startedAt: "desc" },
    });
    const run = await tx.researchRun.create({
      data: {
        trigger: options.trigger ?? "MANUAL",
        segment: RESEARCH_SEGMENT,
        status: "RUNNING",
        previousId: previous?.id,
        startedAt: now,
        summary: {},
        snapshot: json(previous?.snapshot ?? research),
        decisions: [],
        changes: [],
        checks: [],
        discoveries: [],
      },
    });
    return { run, claimed: true, previous };
  });
  if (!claimed.claimed)
    return { id: claimed.run.id, status: "RUNNING", summary: null };
  const { run, previous } = claimed;
  const priorSnapshot = previous
    ? (previous.snapshot as unknown as ResearchSnapshot)
    : null;
  let acquired: AcquisitionResult = {
    sources: [],
    facts: [],
    candidates: [],
    discoveries: [],
    checks: [],
  };
  try {
    const resources = await db.researchResource.findMany();
    const blockedResources = resources.filter((item) =>
      ["ACCESS_BLOCKED", "ROBOTS_DENIED", "POLICY_REVIEW"].includes(item.state),
    );
    const knownUrls = [
      ...new Set([
        ...(priorSnapshot ?? research).sources.map((item) => item.url),
        ...resources
          .filter(
            (item) =>
              item.policyStatus === "ALLOWED" &&
              item.kind === "EVIDENCE" &&
              item.lastSuccessAt &&
              item.state === "ACTIVE",
          )
          .map((item) => item.url),
      ]),
    ];
    acquired = await (options.acquire ?? collectResearch)({
      knownUrls,
      blockedUrls: blockedResources.map((item) => item.url),
      pageBudget: options.pageBudget,
      now,
    });
    const completedAt = options.now ?? new Date();
    const snapshot = mergeResearch(priorSnapshot, acquired, completedAt);
    const changes = researchChanges(priorSnapshot, snapshot, completedAt);
    const priorUrls = new Set([
      ...resources.map((item) => resourceUrl(item.url)),
      ...(priorSnapshot ?? research).sources.map((item) =>
        resourceUrl(item.url),
      ),
    ]);
    const counts = { inserted: 0, updated: 0, duplicates: 0, reviewed: 0 };
    const importedUrls = new Set<string>();
    const newDiscoveries = acquired.discoveries.filter(
      (item) => !priorUrls.has(resourceUrl(item.url)),
    );
    for (const discovery of acquired.discoveries) {
      const url = resourceUrl(discovery.url);
      await db.researchResource.upsert({
        where: { url },
        create: {
          url,
          host: new URL(url).hostname,
          kind: discovery.kind,
          policyStatus: discovery.status,
          discoveredFrom: discovery.discoveredFrom,
        },
        update: {},
      });
    }
    for (const check of acquired.checks) {
      const url = resourceUrl(check.url);
      const state = check.status === "PARSED" ? "ACTIVE" : check.status;
      await db.researchResource.upsert({
        where: { url },
        create: {
          url,
          host: new URL(url).hostname,
          kind: "EVIDENCE",
          policyStatus:
            check.status === "POLICY_REVIEW" ? "REVIEW_REQUIRED" : "ALLOWED",
          state,
          lastCheckedAt: new Date(check.checkedAt),
          lastSuccessAt:
            check.status === "PARSED" ? new Date(check.checkedAt) : null,
          sha256: check.sha256,
          lastReason: check.reason,
        },
        update: {
          state,
          lastCheckedAt: new Date(check.checkedAt),
          ...(check.status === "PARSED"
            ? { lastSuccessAt: new Date(check.checkedAt), sha256: check.sha256 }
            : {}),
          lastReason: check.reason ?? null,
        },
      });
    }
    for (const candidate of acquired.candidates) {
      const input = researchListingInput(candidate, completedAt, snapshot);
      if (!input) continue;
      const source = snapshot.sources.find(
        (item) => item.id === candidate.sourceId,
      )!;
      const host = new URL(candidate.sourceUrl).hostname;
      // Preserve the first pilot's source namespaces and price histories.
      const sourceId =
        host === "www.genccity.com"
          ? "research-genccity"
          : host === "www.gayrimenkulakgun.com"
            ? "research-akgun"
            : `research-${host.replace(/^www\./, "").replace(/[^a-z0-9-]/g, "-")}`;
      await db.listingSource.upsert({
        where: { id: sourceId },
        create: {
          id: sourceId,
          name: source.name,
          method: "PUBLIC_RESEARCH",
          accessStatus: "AVAILABLE",
          categories: [input.category],
          regions: ["İstanbul / Silivri"],
          authorization: source.usageNote,
        },
        update: { authorization: source.usageNote },
      });
      const result = await importRecords([input], sourceId, "PUBLIC_RESEARCH", {
        observedAt: new Date(candidate.observedAt),
        provenance: {
          researchRunId: run.id,
          researchCandidateId: candidate.id,
          sourceSha256: source.sha256,
          publishedAt: candidate.publishedAt,
          availabilityVerified: false,
          evidenceStatus: "PUBLISHER_CLAIM",
          zoningVerified: false,
          externalReferenceConflict: !!candidate.externalReferenceConflict,
        },
      });
      if (result.reviewed) candidate.identityReviewRequired = true;
      if (result.ids.length) importedUrls.add(resourceUrl(candidate.sourceUrl));
      for (const key of [
        "inserted",
        "updated",
        "duplicates",
        "reviewed",
      ] as const)
        counts[key] += result[key];
    }
    for (const change of changes) {
      if (change.kind !== "PRICE_CHANGED") continue;
      if (importedUrls.has(resourceUrl(change.key)))
        change.reason +=
          " Kanonik ilan kimliği doğrulandı ve fiyat geçmişi mevcut içe aktarma motoruyla kaydedildi.";
      else {
        change.kind = "CANDIDATE_CHANGED";
        change.reason =
          "Yeni fiyat beyanı veritabanı kimliğiyle uzlaştırılamadı; fiyat geçmişine gerçekleşmiş değişim olarak işlenmedi.";
      }
    }
    const records = await db.listing.findMany({
      where: { isDemo: false, identityStatus: "ACTIVE" },
      include: listingInclude,
    });
    for (const group of potentialParcelGroups(snapshot, completedAt)) {
      const groupedRecords = records.filter((record) =>
        group.candidates.some(
          (candidate) => resourceUrl(candidate.sourceUrl) === record.sourceUrl,
        ),
      );
      if (!groupedRecords.length) continue;
      await db.listingReview.upsert({
        where: { dedupKey: group.dedupKey },
        create: {
          dedupKey: group.dedupKey,
          sourceId: groupedRecords[0].sourceId,
          kind: "POSSIBLE_SHARED_PARCEL",
          reason: group.reason,
          input: json({
            urls: group.candidates.map((candidate) => candidate.sourceUrl),
            parcelNumber: group.candidates[0].parcelNumber,
            sizeM2: group.candidates[0].sizeM2,
          }),
          candidateIds: json(groupedRecords.map((record) => record.id)),
        },
        update: {},
      });
      counts.reviewed += group.candidates.length;
      for (const candidate of group.candidates) {
        candidate.identityReviewRequired = true;
        candidate.reviewReasons = [
          ...new Set([...(candidate.reviewReasons ?? []), group.reason]),
        ];
      }
    }
    const eligibleResearchIds = new Set(
      records
        .filter((record) => {
          if (record.source.method !== "PUBLIC_RESEARCH") return false;
          const candidate = snapshot.candidates.find(
            (item) => resourceUrl(item.sourceUrl) === record.sourceUrl,
          );
          return (
            candidate &&
            !candidate.identityReviewRequired &&
            candidate.price != null &&
            record.price.eq(candidate.price) &&
            record.category === candidate.category &&
            (!candidate.externalId ||
              candidate.externalReferenceConflict ||
              candidate.id === "akgun-3653" ||
              candidate.externalId === record.externalId) &&
            candidateLegalVerified(candidate, completedAt, snapshot) &&
            verifiedResearchField(
              candidate,
              "availability",
              completedAt,
              snapshot,
            )
          );
        })
        .map((record) => record.id),
    );
    const pool = records
      .filter(
        (record) =>
          record.source.method !== "PUBLIC_RESEARCH" ||
          eligibleResearchIds.has(record.id),
      )
      .map(evidence);
    await db.$transaction(
      (tx) => analyzeAll(tx, { eligibleResearchIds, now: completedAt }),
      { timeout: 60_000 },
    );
    const decisions = snapshot.candidates.map((candidate) => {
      const record = records.find(
        (item) => item.sourceUrl === resourceUrl(candidate.sourceUrl),
      );
      const reconciled =
        record &&
        !candidate.identityReviewRequired &&
        candidate.price != null &&
        record.price.eq(candidate.price) &&
        record.category === candidate.category &&
        (!candidate.externalId ||
          candidate.externalReferenceConflict ||
          candidate.id === "akgun-3653" ||
          candidate.externalId === record.externalId);
      const assessment = reconciled
        ? assess(evidence(record), pool, completedAt)
        : null;
      const decision = researchDecision(
        candidate,
        completedAt,
        assessment,
        snapshot,
      );
      if (candidate.identityReviewRequired) {
        decision.verdict = "Yetersiz veri";
        decision.missing.push(
          "İlan kimliği/fiyat çelişkisi için inceleme ve veritabanı uzlaştırması",
        );
      }
      return decision;
    });
    const priorDecisions = (previous?.decisions ?? []) as unknown as Decision[];
    for (const decision of decisions) {
      const storedOld = priorDecisions.find(
        (item) => item.sourceUrl === decision.sourceUrl,
      );
      const oldCandidate = priorSnapshot?.candidates.find(
        (item) => item.sourceUrl === decision.sourceUrl,
      );
      // Compare the same decision rules on both evidence sets. A code update
      // must not masquerade as a price or market-evidence change.
      const old =
        storedOld && oldCandidate && priorSnapshot
          ? researchDecision(
              oldCandidate,
              previous!.completedAt ?? previous!.startedAt,
              storedOld.assessment,
              priorSnapshot,
            )
          : storedOld;
      if (!old || meaningfulDecision(old) === meaningfulDecision(decision))
        continue;
      const causes = changes.filter(
        (item) =>
          item.key === decision.sourceUrl ||
          (item.kind === "FACT_CHANGED" &&
            decision.factIds.includes(item.key)) ||
          (item.kind === "SOURCE_INVALIDATED" &&
            item.key === decision.sourceUrl),
      );
      if (old.alternatives !== decision.alternatives)
        causes.push({
          kind: "CANDIDATE_CHANGED",
          key: decision.sourceUrl ?? decision.id,
          before: null,
          after: null,
          reason:
            "Aynı dar segmentte araştırılan alternatif aday kümesi yenilendi. Hukuki özellikleri doğrulanmayan adaylar fiyat emsali sayılmadı; yatırım sonucu ve daha iyi alternatif iddiası buna göre yeniden kontrol edildi.",
        });
      changes.push({
        kind: "DECISION_REVISED",
        key: decision.sourceUrl ?? decision.id,
        before: old.verdict,
        after: decision.verdict,
        reason: causes.length
          ? causes.map((item) => item.reason).join(" ")
          : "Kaynak güncelliği, eksik kanıt veya emsal kümesi değişti; eski olumlu/olumsuz gerekçeler güncel kanıtla yeniden değerlendirildi.",
      });
    }
    const current = snapshot.candidates.filter((candidate) => {
      const source = snapshot.sources.find(
        (item) => item.id === candidate.sourceId,
      );
      return !!source && sourceFresh(source, completedAt);
    });
    const summary: ResearchSummary = {
      checkedUrls: acquired.checks.filter(
        (item) => item.status !== "BUDGET_DEFERRED",
      ).length,
      parsedSources: acquired.sources.length,
      newSourceUrls: newDiscoveries.length,
      newCandidates: changes.filter((item) => item.kind === "NEW_CANDIDATE")
        .length,
      pricedCandidates: current.filter((item) => item.price != null).length,
      ...counts,
      priceChanges: changes.filter((item) => item.kind === "PRICE_CHANGED")
        .length,
      factChanges: changes.filter((item) => item.kind === "FACT_CHANGED")
        .length,
      decisionRevisions: changes.filter(
        (item) => item.kind === "DECISION_REVISED",
      ).length,
      invalidatedSources: changes.filter(
        (item) => item.kind === "SOURCE_INVALIDATED",
      ).length,
      unchangedCandidates: current.filter(
        (item) =>
          !!priorSnapshot?.candidates.some(
            (old) =>
              old.sourceUrl === item.sourceUrl && old.price === item.price,
          ),
      ).length,
      engineAnalyzed: records.filter((item) =>
        snapshot.candidates.some(
          (candidate) => resourceUrl(candidate.sourceUrl) === item.sourceUrl,
        ),
      ).length,
      reviewCount: decisions.filter(
        (item) => item.verdict === "İncelemeye değer",
      ).length,
      comparableSupported: decisions.filter(
        (item) => item.assessment?.score != null,
      ).length,
    };
    const failed = acquired.checks.some(
      (check) =>
        !["PARSED", "BUDGET_DEFERRED", "POLICY_REVIEW"].includes(check.status),
    );
    const status = !acquired.sources.length
      ? "FAILED"
      : failed
        ? "PARTIAL"
        : "COMPLETED";
    await db.researchRun.update({
      where: { id: run.id },
      data: {
        status,
        completedAt,
        summary: json(summary),
        snapshot: json(snapshot),
        decisions: json(decisions),
        changes: json(changes),
        checks: json(acquired.checks),
        discoveries: json(acquired.discoveries),
      },
    });
    return { id: run.id, status, summary };
  } catch (error) {
    const invalid: ResearchSnapshot = {
      ...(priorSnapshot ?? research),
      sources: (priorSnapshot ?? research).sources.map((source) => ({
        ...source,
        checkStatus: "RUN_FAILED",
      })),
    };
    await db.researchRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        snapshot: json(invalid),
        checks: json(acquired.checks),
        summary: {
          reason:
            "Araştırma çalışması başarısız; önceki kanıtlar yeni kontrol yapılmış gibi sunulmadı.",
        },
        decisions: json(
          invalid.candidates.map((candidate) =>
            researchDecision(candidate, new Date(), null, invalid),
          ),
        ),
      },
    });
    throw error;
  }
}
