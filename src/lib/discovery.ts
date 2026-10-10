import { db } from "./db";
import { z } from "zod";
import { listingInclude } from "./listings";
import { matchesProfile } from "./pilots";
import { missingListingFields, comparableStatus } from "./listing-quality";
import { recentPriceDrops } from "./price-drops";
import { HttpError } from "./http";
const query = z
  .object({
    pilotId: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export async function newRealListings(params: Record<string, string>) {
  const input = query.parse(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "")),
  );
  const profile = input.pilotId
    ? await db.searchProfile.findUnique({
        where: { id: input.pilotId },
        include: { alerts: true },
      })
    : null;
  if (input.pilotId && !profile) throw new HttpError(404, "Pilot bulunamadı.");
  const [all, profiles] = await Promise.all([
    db.listing.findMany({
      where: { isDemo: false, identityStatus: "ACTIVE" },
      include: listingInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    db.searchProfile.findMany({
      where: { pilotKey: { not: null } },
      select: { id: true, name: true },
    }),
  ]);
  const selected = profile
    ? all.filter((l) => matchesProfile(l, profile))
    : all;
  const now = new Date(),
    limit = 50;
  return {
    total: selected.length,
    page: input.page,
    limit,
    profiles,
    listings: selected
      .slice((input.page - 1) * limit, input.page * limit)
      .map((l) => {
        const missingFields = missingListingFields(l),
          status = comparableStatus(l, now);
        return {
          listing: l,
          missingFields,
          comparableStatus: status,
          opportunity:
            status === "SUPPORTED" &&
            !missingFields.length &&
            (l.assessment?.score ?? 0) >= (profile?.alerts[0]?.minScore ?? 70),
          recentDrops: recentPriceDrops(l.id, l.prices, now),
        };
      }),
  };
}
