CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "previousId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "summary" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "decisions" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "checks" JSONB NOT NULL,
    "discoveries" JSONB NOT NULL,
    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResearchRun_startedAt_idx" ON "ResearchRun"("startedAt");
CREATE TABLE "ResearchResource" (
    "url" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "policyStatus" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "discoveredFrom" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "sha256" TEXT,
    "lastReason" TEXT,
    CONSTRAINT "ResearchResource_pkey" PRIMARY KEY ("url")
);
CREATE INDEX "ResearchResource_state_policyStatus_idx" ON "ResearchResource"("state", "policyStatus");
