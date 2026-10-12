-- DropIndex
DROP INDEX "Listing_identityKey_key";

-- DropIndex
DROP INDEX "Listing_sourceUrl_key";

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "reviewed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "identityStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "identityVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ListingSource" ADD COLUMN     "lastNewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "regions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ListingReview" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "candidateIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ListingReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxConnection" (
    "id" TEXT NOT NULL DEFAULT 'personal',
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "accountHash" TEXT,
    "labelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "senders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lookbackDays" INTEGER NOT NULL DEFAULT 7,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "scanAfter" TIMESTAMP(3),
    "scanBefore" TIMESTAMP(3),
    "pageToken" TEXT,
    "lastFetched" INTEGER NOT NULL DEFAULT 0,
    "lastImported" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "deliveryKey" TEXT,
    "transport" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "providerId" TEXT,
    "status" TEXT NOT NULL,
    "proposals" JSONB NOT NULL,
    "errors" JSONB NOT NULL,
    "templateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "reviewed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "sampleMessageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'USER_APPROVED',
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liveValidatedAt" TIMESTAMP(3),

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAttempt" (
    "stateHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthAttempt_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "runId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "listingIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("runId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListingReview_dedupKey_key" ON "ListingReview"("dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_contentHash_key" ON "EmailMessage"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_deliveryKey_key" ON "EmailMessage"("deliveryKey");

-- CreateIndex
CREATE INDEX "Listing_identityKey_idx" ON "Listing"("identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_sourceId_sourceUrl_key" ON "Listing"("sourceId", "sourceUrl");

-- AddForeignKey
ALTER TABLE "ListingReview" ADD CONSTRAINT "ListingReview_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ListingSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing keys are legacy fingerprints. Preserve all original rows and observations.
ALTER TABLE "Listing" ALTER COLUMN "identityVersion" SET DEFAULT 2;
UPDATE "Listing" l SET "identityStatus" = 'REVIEW'
WHERE EXISTS (SELECT 1 FROM "ListingPriceHistory" h WHERE h."listingId"=l.id
 AND h.provenance->>'acquisitionSource' IS NOT NULL
 AND h.provenance->>'acquisitionSource' <> l."sourceId");
INSERT INTO "ListingReview" (id,"sourceId",kind,status,reason,"dedupKey",input,"candidateIds")
SELECT 'legacy:'||id,"sourceId",'LEGACY_AMBIGUITY','PENDING',
 'M1 kaydında farklı kaynaklardan fiyat kökeni var. Eski birleşme geri üretilemez; orijinal kayıtlar korunarak inceleme gerekir.',
 'legacy:'||id,to_jsonb(l),jsonb_build_array(id)
FROM "Listing" l WHERE "identityStatus"='REVIEW';
DELETE FROM "OpportunityAssessment" a USING "Listing" l WHERE a."listingId"=l.id AND l."identityStatus"='REVIEW';
DELETE FROM "ComparableListing" c USING "Listing" l WHERE (c."listingId"=l.id OR c."comparableId"=l.id) AND l."identityStatus"='REVIEW';
