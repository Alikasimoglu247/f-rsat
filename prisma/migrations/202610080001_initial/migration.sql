-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('EV', 'ARABA', 'ARSA', 'TARLA');

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "neighborhood" TEXT,
    "price" DECIMAL(18,2) NOT NULL,
    "sourceUrl" TEXT,
    "externalId" TEXT,
    "identityKey" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "provenance" JSONB NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "authorization" TEXT NOT NULL,
    "accessStatus" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "freshnessHours" INTEGER NOT NULL DEFAULT 168,
    "categories" "Category"[],

    CONSTRAINT "ListingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingPriceHistory" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provenance" JSONB NOT NULL,

    CONSTRAINT "ListingPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyDetails" (
    "listingId" TEXT NOT NULL,
    "sizeM2" DECIMAL(12,2),
    "propertyType" TEXT,
    "rooms" TEXT,
    "buildingAge" INTEGER,
    "condition" TEXT,
    "legalStatus" TEXT,
    "earthquakeInfo" TEXT,

    CONSTRAINT "PropertyDetails_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "VehicleDetails" (
    "listingId" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "trim" TEXT,
    "modelYear" INTEGER,
    "mileage" INTEGER,
    "fuel" TEXT,
    "transmission" TEXT,
    "damageHistory" TEXT,

    CONSTRAINT "VehicleDetails_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "LandDetails" (
    "listingId" TEXT NOT NULL,
    "sizeM2" DECIMAL(12,2),
    "classification" TEXT,
    "zoning" TEXT,
    "roadAccess" TEXT,
    "parcelNumber" TEXT,
    "sharedOwnership" TEXT,
    "agriculturalRestrictions" TEXT,

    CONSTRAINT "LandDetails_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "SearchProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "Category",
    "province" TEXT,
    "district" TEXT,
    "minPrice" DECIMAL(18,2),
    "maxPrice" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparableListing" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "comparableId" TEXT NOT NULL,
    "normalizedPrice" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "ComparableListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityAssessment" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "medianPrice" DECIMAL(18,2),
    "rangeLow" DECIMAL(18,2),
    "rangeHigh" DECIMAL(18,2),
    "relativeDifference" DECIMAL(10,4),
    "priceChange" DECIMAL(10,4),
    "sampleCount" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "score" INTEGER,
    "riskFlags" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "minScore" INTEGER NOT NULL DEFAULT 70,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "alertId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSyncLog" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'personal',
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minScore" INTEGER NOT NULL DEFAULT 70,
    "includeDemoNotifications" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Listing_sourceUrl_key" ON "Listing"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_identityKey_key" ON "Listing"("identityKey");

-- CreateIndex
CREATE INDEX "Listing_category_province_district_idx" ON "Listing"("category", "province", "district");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_sourceId_externalId_key" ON "Listing"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "ListingPriceHistory_listingId_observedAt_idx" ON "ListingPriceHistory"("listingId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComparableListing_listingId_comparableId_key" ON "ComparableListing"("listingId", "comparableId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityAssessment_listingId_key" ON "OpportunityAssessment"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ListingSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPriceHistory" ADD CONSTRAINT "ListingPriceHistory_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDetails" ADD CONSTRAINT "PropertyDetails_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDetails" ADD CONSTRAINT "VehicleDetails_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandDetails" ADD CONSTRAINT "LandDetails_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparableListing" ADD CONSTRAINT "ComparableListing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparableListing" ADD CONSTRAINT "ComparableListing_comparableId_fkey" FOREIGN KEY ("comparableId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityAssessment" ADD CONSTRAINT "OpportunityAssessment_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ListingSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSyncLog" ADD CONSTRAINT "SourceSyncLog_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ListingSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

