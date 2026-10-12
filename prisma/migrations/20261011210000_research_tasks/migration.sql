CREATE TABLE "ResearchTask" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "result" JSONB NOT NULL,
  CONSTRAINT "ResearchTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResearchTask_requestedAt_idx" ON "ResearchTask"("requestedAt");
