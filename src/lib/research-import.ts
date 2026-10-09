import type { SearchProfile } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { research, sourceFresh } from "./investment";
import { listingSchema } from "./validation";

export type ResearchCandidate = (typeof research.candidates)[number];
export function researchListingInput(
  candidate: ResearchCandidate,
  now = new Date(),
) {
  const source = research.sources.find(
    (item) => item.id === candidate.sourceId,
  );
  if (
    !source ||
    source.url !== candidate.sourceUrl ||
    source.retrievedAt !== candidate.observedAt ||
    !sourceFresh(source, now) ||
    candidate.price == null
  )
    return null;
  return listingSchema.parse({
    title: candidate.title,
    category: candidate.category,
    province: candidate.province,
    district: candidate.district,
    neighborhood: candidate.neighborhood,
    transactionType: candidate.transactionType,
    price: candidate.price,
    sourceUrl: candidate.sourceUrl,
    // Conflicting reference numbers are not a strong external identity.
    externalId:
      candidate.id === "akgun-3653" ? undefined : candidate.externalId,
    isDemo: false,
    sizeM2: candidate.sizeM2,
    classification: candidate.classification,
    zoning: candidate.zoning,
    roadAccess: candidate.roadAccess,
    parcelNumber: candidate.parcelNumber,
    sharedOwnership: candidate.sharedOwnership,
    agriculturalRestrictions: candidate.agriculturalRestrictions,
  });
}
export function researchInProfile(
  candidate: ResearchCandidate,
  profile: SearchProfile,
) {
  const norm = (value: string) => value.trim().toLocaleLowerCase("tr-TR");
  const categories = profile.categories.length
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
    (!categories.length ||
      categories.some((value) => value === candidate.category)) &&
    (!regions.length ||
      regions.some((value) => norm(value) === norm(candidate.province))) &&
    (!profile.district ||
      norm(profile.district) === norm(candidate.district)) &&
    (!profile.transactionType ||
      norm(profile.transactionType) === norm(candidate.transactionType)) &&
    (!profile.minPrice ||
      (candidate.price != null &&
        new Prisma.Decimal(candidate.price).gte(profile.minPrice))) &&
    (!profile.maxPrice ||
      (candidate.price != null &&
        new Prisma.Decimal(candidate.price).lte(profile.maxPrice))) &&
    profile.bodyTypes.length === 0 &&
    profile.fuels.length === 0
  );
}
