ALTER TABLE "MailboxConnection" ADD COLUMN "retryAfter" TIMESTAMP(3);
ALTER TABLE "EmailMessage" ADD COLUMN "seenViaGmailAt" TIMESTAMP(3);
CREATE TABLE "EmailDelivery" (
  "key" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
