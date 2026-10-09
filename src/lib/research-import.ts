import type { SearchProfile } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  research,
  researchCandidateFresh,
  verifiedResearchField,
  type ResearchCandidate,
  type ResearchSnapshot,
} from "./investment";
import { listingSchema } from "./validation";

export type { ResearchCandidate } from "./investment";
export function researchListingInput(
  candidate: ResearchCandidate,
  now = new Date(),
  data: ResearchSnapshot = research,
) {
  if (!researchCandidateFresh(candidate, now, data) || candidate.price == null)
    return null;
  const verified = (field: Parameters<typeof verifiedResearchField>[1]) =>
    verifiedResearchField(candidate, field, now, data);
  const parsed = listingSchema.safeParse({
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
      candidate.externalReferenceConflict || candidate.id === "akgun-3653"
        ? undefined
        : candidate.externalId,
    isDemo: false,
    sizeM2: candidate.sizeM2,
    netM2: candidate.netM2,
    grossM2: candidate.grossM2,
    propertyType: candidate.propertyType,
    rooms: candidate.rooms,
    buildingAge: candidate.buildingAge,
    condition: candidate.condition,
    legalStatus: verified("legalStatus") ? candidate.legalStatus : undefined,
    earthquakeInfo: verified("earthquakeInfo")
      ? candidate.earthquakeInfo
      : undefined,
    classification: verified("classification")
      ? candidate.classification
      : undefined,
    zoning: verified("zoning") ? candidate.zoning : undefined,
    roadAccess: verified("roadAccess") ? candidate.roadAccess : undefined,
    parcelNumber: candidate.parcelNumber,
    sharedOwnership:
      verified("sharedOwnership") ||
      candidate.sharedOwnership?.toLocaleLowerCase("tr-TR").includes("hisseli")
        ? candidate.sharedOwnership
        : undefined,
    agriculturalRestrictions: verified("agriculturalRestrictions")
      ? candidate.agriculturalRestrictions
      : undefined,
    ...candidate.vehicle,
  });
  return parsed.success ? parsed.data : null;
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
