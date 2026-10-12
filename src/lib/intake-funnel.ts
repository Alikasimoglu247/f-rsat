import type {
  EmailMessage,
  ListingReview,
  SearchProfile,
} from "@prisma/client";
import type { StoredListing } from "./listings";
import { listingSchema } from "./validation";
import { normalizeBodyType } from "./constants";
import type { EmailProposal } from "./email/parser";
import type { Category } from "./constants";
type Proposal = EmailProposal & {
  listingId?: string;
  processed?: boolean;
  outcome?: string;
  reviewId?: string;
  userCompletedAt?: string;
};
const norm = (v?: string | null) => v?.trim().toLocaleLowerCase("tr-TR");
export function pilotEnvelope(
  fields: {
    category?: Category;
    province?: string;
    district?: string;
    bodyType?: string;
  },
  profile: SearchProfile,
) {
  const cats = profile.categories.length
    ? profile.categories
    : profile.category
      ? [profile.category]
      : [];
  const regions = profile.provinces.length
    ? profile.provinces
    : profile.province
      ? [profile.province]
      : [];
  return (
    (!cats.length || (!!fields.category && cats.includes(fields.category))) &&
    (!regions.length ||
      (!!fields.province &&
        regions.some((p) => norm(p) === norm(fields.province)))) &&
    (!profile.district || norm(fields.district) === norm(profile.district)) &&
    (!profile.bodyTypes.length ||
      (!!normalizeBodyType(fields.bodyType) &&
        profile.bodyTypes.includes(normalizeBodyType(fields.bodyType)!)))
  );
}
export function storedEnvelope(l: StoredListing, p: SearchProfile) {
  return pilotEnvelope(
    {
      category: l.category,
      province: l.province,
      district: l.district,
      bodyType: l.vehicle?.bodyType ?? undefined,
    },
    p,
  );
}
export function attributedReceipt(
  m: EmailMessage,
  p: SearchProfile,
  listings: StoredListing[],
) {
  if (m.pilotIds.includes(p.id)) return true;
  if (p.mailLabelIds.length || p.mailSenders.length)
    return (
      (!p.mailLabelIds.length ||
        p.mailLabelIds.every((id) => m.gmailLabelIds.includes(id))) &&
      (!p.mailSenders.length ||
        p.mailSenders.some((s) => norm(s) === norm(m.sender)))
    );
  return (m.proposals as unknown as Proposal[]).some(
    (item) =>
      pilotEnvelope(item.fields ?? {}, p) ||
      (!!item.listingId &&
        listings.some((l) => l.id === item.listingId && storedEnvelope(l, p))),
  );
}
const listingKey = (l: StoredListing) =>
  `${l.sourceId}:${l.externalId ?? l.sourceUrl ?? l.id}`;
export function intakeFunnel(
  profile: SearchProfile,
  listings: StoredListing[],
  receipts: EmailMessage[],
  reviews: ListingReview[],
) {
  const attributed = receipts.filter((m) =>
    attributedReceipt(m, profile, listings),
  );
  const parsed = new Set<string>(),
    pending = new Set<string>(),
    saved = new Set<string>(),
    completed = new Set<string>();
  for (const l of listings)
    if (!l.isDemo && storedEnvelope(l, profile)) saved.add(l.id);
  for (const m of attributed) {
    for (const [index, p] of (m.proposals as unknown as Proposal[]).entries()) {
      const linked = listings.find((l) => l.id === p.listingId);
      const key = linked
        ? listingKey(linked)
        : `${p.providerId}:${p.fields?.externalId ?? p.fields?.sourceUrl ?? `${m.id}:${index}`}`;
      if (listingSchema.safeParse(p.fields).success) {
        parsed.add(key);
        if (p.userCompletedAt) completed.add(key);
      }
      if (
        (!p.processed && m.status !== "IMPORTED") ||
        (p.outcome === "reviewed" &&
          reviews.some((r) => r.id === p.reviewId && r.status === "PENDING")) ||
        (p.missing ?? []).length
      )
        pending.add(key);
      if (linked && !linked.isDemo) saved.add(linked.id);
    }
  }
  for (const r of reviews) {
    if (r.status !== "PENDING") continue;
    const ids = Array.isArray(r.candidateIds)
      ? r.candidateIds.filter((x): x is string => typeof x === "string")
      : [];
    for (const l of listings)
      if (ids.includes(l.id) && saved.has(l.id)) pending.add(listingKey(l));
  }
  return {
    gmailNotifications: attributed.filter((m) => m.seenViaGmailAt).length,
    localEmlSamples: attributed.filter((m) => !m.seenViaGmailAt).length,
    parsedListings: parsed.size,
    userCompletedListings: completed.size,
    pendingListings: pending.size,
    savedReal: saved.size,
    unparsedNotifications: attributed.filter(
      (m) => !(m.proposals as unknown[]).length,
    ).length,
  };
}
