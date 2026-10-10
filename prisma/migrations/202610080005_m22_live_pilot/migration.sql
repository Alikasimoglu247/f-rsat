-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "gmailLabelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pilotIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SearchProfile" ADD COLUMN     "mailLabelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mailSenders" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "EmailFieldCorrection" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "proposalIndex" INTEGER NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "evidenceNote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailFieldCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulerHealth" (
    "id" TEXT NOT NULL DEFAULT 'personal',
    "instanceId" TEXT,
    "status" TEXT NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
    "lastTickAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "schedule" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',

    CONSTRAINT "SchedulerHealth_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EmailFieldCorrection" ADD CONSTRAINT "EmailFieldCorrection_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
