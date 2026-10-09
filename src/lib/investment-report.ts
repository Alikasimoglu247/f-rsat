import { db } from "./db";
import { evidence, listingInclude } from "./listings";
import { matchesProfile } from "./pilots";
import {
  listingDecision,
  realAnnualChange,
  research,
  researchDecision,
  sourceFresh,
  supportedFact,
} from "./investment";
import { assess } from "./analysis";
import { researchInProfile } from "./research-import";

export async function investmentReport(now = new Date()) {
  const [listings, profiles] = await Promise.all([
    db.listing.findMany({
      where: { isDemo: false, identityStatus: "ACTIVE" },
      include: listingInclude,
    }),
    db.searchProfile.findMany({
      where: { pilotKey: { in: ["SILIVRI", "MARMARA_SUV"] } },
    }),
  ]);
  const reports = ["SILIVRI", "MARMARA_SUV"].map((pilotKey) => {
    const profile = profiles.find((item) => item.pilotKey === pilotKey);
    // Existing editable search profiles remain the authority for real database scope.
    const selected = profile
      ? listings.filter((item) => matchesProfile(item, profile))
      : [];
    const pool = selected.map(evidence);
    const stored = selected.flatMap((item) => {
      const candidate = research.candidates.find(
        (candidate) =>
          candidate.sourceUrl === item.sourceUrl &&
          candidate.price != null &&
          item.price.eq(candidate.price),
      );
      if (candidate)
        return [
          {
            ...researchDecision(
              candidate,
              now,
              assess(evidence(item), pool, now),
            ),
            id: item.id,
            origin: "DATABASE" as const,
          },
        ];
      const decision = listingDecision(
        evidence(item),
        pool,
        item.sourceUrl,
        now,
      );
      return decision ? [decision] : [];
    });
    const researched =
      pilotKey === "SILIVRI" && profile
        ? research.candidates
            .filter((item) => researchInProfile(item, profile))
            .map((item) => researchDecision(item, now))
        : [];
    // A research page is not a priced database listing. Do not merge/count it twice.
    const unique = researched.filter(
      (candidate) =>
        !stored.some((item) => item.sourceUrl === candidate.sourceUrl),
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
        (item) => item.assessment?.score != null,
      ).length,
      reviewCount: decisions.filter(
        (item) => item.verdict === "İncelemeye değer",
      ).length,
      decisions,
    };
  });
  return {
    evaluatedAt: now.toISOString(),
    researchedAt: research.researchedAt,
    sources: research.sources.map((source) => ({
      ...source,
      fresh: sourceFresh(source, now),
    })),
    facts: research.facts.map((fact) => ({
      ...fact,
      current: !!supportedFact(fact.id, now),
    })),
    neighborhoods: research.neighborhoods,
    strategies: research.strategies,
    excludedSources: research.excludedSources,
    istanbulRealChange: realAnnualChange(
      supportedFact("housing-istanbul", now),
      supportedFact("cpi-august", now),
    ),
    pilots: reports,
  };
}
export type InvestmentReport = Awaited<ReturnType<typeof investmentReport>>;
