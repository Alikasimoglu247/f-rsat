import { db } from "../db";
import { ensureSources } from "../providers/registry";
import { ensureMailbox } from "./gmail";
import { gmailConfiguration, readTokens } from "./secrets";
import type { EmailProposal } from "./parser";
export async function mailboxHealth() {
  const mailbox = await ensureMailbox(),
    configuration = gmailConfiguration();
  let hasStoredToken = false;
  if (
    mailbox.accountHash &&
    mailbox.status !== "DISCONNECTED" &&
    configuration.configured
  ) {
    try {
      hasStoredToken = (await readTokens()).accountHash === mailbox.accountHash;
    } catch {
      /* Never expose token content or errors. */
    }
  }
  const status =
    mailbox.accountHash && mailbox.status !== "DISCONNECTED" && !hasStoredToken
      ? "MISSING_TOKEN"
      : mailbox.status;
  return {
    mailbox,
    status,
    configuration: { ...configuration, hasStoredToken },
  };
}
export async function emailStatus() {
  const { mailbox, status, configuration } = await mailboxHealth();
  const [
    messages,
    totalMessages,
    templates,
    reviews,
    totalReviews,
    statusCounts,
  ] = await Promise.all([
    db.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.emailMessage.count(),
    db.emailTemplate.findMany({ orderBy: { confirmedAt: "desc" }, take: 100 }),
    db.listingReview.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.listingReview.count({ where: { status: "PENDING" } }),
    db.emailMessage.groupBy({ by: ["status"], _count: true }),
  ]);
  return {
    configuration,
    mailbox: {
      status,
      labelIds: mailbox.labelIds,
      senders: mailbox.senders,
      lookbackDays: mailbox.lookbackDays,
      lastSuccessAt: mailbox.lastSuccessAt,
      lastError: mailbox.lastError,
      lastFetched: mailbox.lastFetched,
      lastImported: mailbox.lastImported,
      hasMore: !!mailbox.pageToken,
      retryAfter: mailbox.retryAfter,
    },
    messages,
    templates,
    reviews,
    totalMessages,
    totalReviews,
    statusCounts: statusCounts.map((s) => ({
      status: s.status,
      count: s._count,
    })),
  };
}
export async function sourceCoverage() {
  await ensureSources(db);
  const [sources, imports, counts, regions, pending, missingListings, mailbox] =
    await Promise.all([
      db.listingSource.findMany({
        include: {
          logs: { orderBy: { createdAt: "desc" }, take: 5 },
          _count: { select: { listings: true } },
        },
        orderBy: { name: "asc" },
      }),
      db.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      db.listing.groupBy({ by: ["sourceId", "isDemo"], _count: true }),
      db.listing.groupBy({
        by: ["sourceId", "province", "category"],
        where: { isDemo: false },
        _count: true,
      }),
      db.emailMessage.findMany({
        where: { status: { not: "IMPORTED" } },
        select: { proposals: true },
      }),
      db.listing.count({
        where: {
          isDemo: false,
          OR: [
            { identityStatus: "REVIEW" },
            {
              category: "EV",
              OR: [
                { property: { is: null } },
                {
                  property: {
                    is: {
                      OR: [
                        { sizeM2: null },
                        { rooms: null },
                        { propertyType: null },
                        { buildingAge: null },
                        { condition: null },
                      ],
                    },
                  },
                },
              ],
            },
            {
              category: "ARABA",
              OR: [
                { vehicle: { is: null } },
                {
                  vehicle: {
                    is: {
                      OR: [
                        { make: null },
                        { model: null },
                        { trim: null },
                        { modelYear: null },
                        { mileage: null },
                        { damageHistory: null },
                        { fuel: null },
                        { transmission: null },
                      ],
                    },
                  },
                },
              ],
            },
            {
              category: { in: ["ARSA", "TARLA"] },
              OR: [
                { land: { is: null } },
                {
                  land: {
                    is: {
                      OR: [
                        { sizeM2: null },
                        { classification: null },
                        { zoning: null },
                        { roadAccess: null },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
      mailboxHealth(),
    ]);
  return {
    sources: sources.map((source) => ({
      ...source,
      accessStatus:
        source.accessStatus === "CONNECTED" &&
        ["sahibinden-email", "arabam-email"].includes(source.id) &&
        mailbox.status !== "CONNECTED"
          ? mailbox.status
          : source.accessStatus,
      realCount:
        counts.find((c) => c.sourceId === source.id && !c.isDemo)?._count ?? 0,
      demoCount:
        counts.find((c) => c.sourceId === source.id && c.isDemo)?._count ?? 0,
      actualRegions: [
        ...new Set(
          regions
            .filter((r) => r.sourceId === source.id)
            .map((r) => r.province),
        ),
      ],
      actualCategories: [
        ...new Set(
          regions
            .filter((r) => r.sourceId === source.id)
            .map((r) => r.category),
        ),
      ],
      pendingMessages: pending.filter((m) =>
        (m.proposals as unknown as EmailProposal[]).some(
          (p) => p.providerId === source.id,
        ),
      ).length,
      missingFields: [
        ...new Set(
          pending.flatMap((m) =>
            (m.proposals as unknown as EmailProposal[])
              .filter((p) => p.providerId === source.id)
              .flatMap((p) => p.missing),
          ),
        ),
      ],
    })),
    imports,
    summary: {
      real: counts.filter((c) => !c.isDemo).reduce((s, c) => s + c._count, 0),
      demo: counts.filter((c) => c.isDemo).reduce((s, c) => s + c._count, 0),
      unprocessed: pending.length,
      missingListings,
    },
  };
}
