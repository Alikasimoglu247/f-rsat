import { db } from "./db";
import { investmentReport } from "./investment-report";
import { listingInclude } from "./listings";
import { researchSegments, selectStrategy } from "./research/strategy";
import { loadResearchState } from "./research/store";
import { research } from "./investment";
import { recentPriceDrops } from "./price-drops";
import { authorizedFeedStatus } from "./research/authorized-feed";

export async function productReport(now = new Date()) {
  const [
    investment,
    listings,
    counts,
    tasks,
    resources,
    runCount,
    histories,
    sources,
    state,
  ] = await Promise.all([
    investmentReport(now),
    db.listing.findMany({
      where: { isDemo: false },
      include: listingInclude,
      orderBy: { lastObservedAt: "desc" },
      take: 500,
    }),
    db.listing.groupBy({ by: ["isDemo"], _count: true }),
    db.researchTask.findMany({ where:{action:{in:["RESEARCH","REEVALUATE"]}},orderBy: { requestedAt: "desc" }, take: 5 }),
    db.researchResource.findMany({
      orderBy: { lastCheckedAt: "desc" },
      take: 100,
    }),
    db.researchRun.count(),
    db.researchRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 30,
      select: { summary: true, status: true },
    }),
    db.listingSource.findMany({ where: { method: "PUBLIC_RESEARCH" } }),
    loadResearchState(),
  ]);
  const strategy = selectStrategy(histories, state.snapshot ?? research, now);
  const running = await db.researchRun.findFirst({
    where: {
      status: "RUNNING",
      startedAt: { gt: new Date(now.getTime() - 30 * 60_000) },
    },
    select: { id: true, segment: true, startedAt: true, summary: true },
  });
  return {
    investment,
    listings,
    tasks: tasks.map((task) => ({
      ...task,
      status:
        task.status === "RUNNING" &&
        now.getTime() - task.requestedAt.getTime() > 30 * 60_000
          ? "INTERRUPTED"
          : task.status,
    })),
    resources,
    sources,
    running,
    counts: {
      real: counts.find((c) => !c.isDemo)?._count ?? 0,
      demo: counts.find((c) => c.isDemo)?._count ?? 0,
      researchRuns: runCount,
      properties: listings.filter((l) => l.category !== "ARABA").length,
      vehicles: listings.filter((l) => l.category === "ARABA").length,
    },
    recentDrops: listings.flatMap((listing) =>
      recentPriceDrops(
        listing.id,
        listing.prices.filter(
          (p) =>
            p.provenance &&
            typeof p.provenance === "object" &&
            !Array.isArray(p.provenance) &&
            p.provenance.priceVerification === "VERIFIED",
        ),
        now,
      ).map((drop) => ({
        title: listing.title,
        ...drop,
      })),
    ),
    nextStrategy: {
      ...strategy,
      label:
        researchSegments.find((s) => s.id === strategy.segmentId)?.label ??
        "Bekleme",
    },
    databaseReady: true,
    dataAcquisition: authorizedFeedStatus(),
  };
}
export type ProductReport = Awaited<ReturnType<typeof productReport>>;
