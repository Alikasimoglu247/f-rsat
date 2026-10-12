-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "transactionType" TEXT;

-- AlterTable
ALTER TABLE "PropertyDetails" ADD COLUMN     "grossM2" DECIMAL(12,2),
ADD COLUMN     "netM2" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "SearchProfile" ADD COLUMN     "bodyTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "categories" "Category"[] DEFAULT ARRAY[]::"Category"[],
ADD COLUMN     "fuels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pilotKey" TEXT,
ADD COLUMN     "provinces" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "trackPriceDrops" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transactionType" TEXT;

-- AlterTable
ALTER TABLE "VehicleDetails" ADD COLUMN     "bodyType" TEXT,
ADD COLUMN     "bodyTypeEvidence" TEXT,
ADD COLUMN     "bodyTypeVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "SearchProfile_pilotKey_key" ON "SearchProfile"("pilotKey");

-- Explicit pilot filters; existing profiles and alert preferences remain intact.
INSERT INTO "SearchProfile" (id,name,"pilotKey",categories,provinces,province,district,"transactionType","trackPriceDrops")
VALUES ('pilot-silivri','Silivri Gayrimenkul Fırsatları','SILIVRI',ARRAY['EV','ARSA','TARLA']::"Category"[],ARRAY['İstanbul'],'İstanbul','Silivri','SATILIK',true)
ON CONFLICT ("pilotKey") DO NOTHING;
INSERT INTO "SearchProfile" (id,name,"pilotKey",categories,provinces,"bodyTypes",fuels,"trackPriceDrops")
VALUES ('pilot-marmara-suv','Marmara SUV Fırsatları','MARMARA_SUV',ARRAY['ARABA']::"Category"[],ARRAY['İstanbul','Tekirdağ','Edirne','Kırklareli','Kocaeli','Sakarya','Yalova','Bursa','Balıkesir','Çanakkale','Bilecik'],ARRAY['SUV','CROSSOVER'],ARRAY['Elektrikli','Hibrit','Benzin','Dizel'],true)
ON CONFLICT ("pilotKey") DO NOTHING;
INSERT INTO "Alert" (id,"profileId","minScore",enabled)
VALUES ('pilot-silivri-alert','pilot-silivri',70,true),('pilot-marmara-suv-alert','pilot-marmara-suv',70,true)
ON CONFLICT (id) DO NOTHING;

-- No old body classification is inferred from title, make or model.
INSERT INTO "ListingReview" (id,"sourceId",kind,reason,"dedupKey",input,"candidateIds")
SELECT 'm21-body-review-' || id,"sourceId",'VEHICLE_BODY_TYPE',
       'Gövde tipi için doğrulanmış kanıt yok. SUV sınıflandırması kullanıcı incelemesi bekliyor.',
       'body-type:' || id,jsonb_build_object('listingId',id,'title',title),jsonb_build_array(id)
FROM "Listing" WHERE category='ARABA' AND NOT "isDemo"
ON CONFLICT ("dedupKey") DO NOTHING;

-- Cached results must be recomputed under the new comparison rules.
DELETE FROM "ComparableListing" WHERE "listingId" IN (SELECT id FROM "Listing" WHERE NOT "isDemo") OR "comparableId" IN (SELECT id FROM "Listing" WHERE NOT "isDemo");
DELETE FROM "OpportunityAssessment" WHERE "listingId" IN (SELECT id FROM "Listing" WHERE NOT "isDemo");

