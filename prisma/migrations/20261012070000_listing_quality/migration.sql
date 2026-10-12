ALTER TABLE "Listing"
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "pageCheckedAt" TIMESTAMP(3),
  ADD COLUMN "priceVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "priceVerification" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "availabilityStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "availabilityVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "verificationEvidence" JSONB;

-- Backfill only dates explicitly present in old research provenance. No old
-- access/observation timestamp is promoted to price or availability verification.
UPDATE "Listing" SET "publishedAt" = (provenance->>'publishedAt')::timestamp
WHERE provenance->>'publishedAt' ~ '^\d{4}-\d{2}-\d{2}$'
  AND pg_input_is_valid(provenance->>'publishedAt', 'timestamp');
UPDATE "Listing" l SET "pageCheckedAt" = l."lastObservedAt"
FROM "ListingSource" s WHERE s.id=l."sourceId" AND s.method='PUBLIC_RESEARCH';

-- Derived, unverified scores are invalidated; original records and every price
-- observation remain intact. The engine can recompute after the quality gate.
UPDATE "OpportunityAssessment" a SET score=NULL, "medianPrice"=NULL,
  "rangeLow"=NULL, "rangeHigh"=NULL, "relativeDifference"=NULL,
  "sampleCount"=0, confidence='INSUFFICIENT'
FROM "Listing" l WHERE l.id=a."listingId" AND NOT l."isDemo";
DELETE FROM "ComparableListing" c USING "Listing" l
WHERE l.id=c."listingId" AND NOT l."isDemo";
