-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('COLD_OUTREACH', 'DRIP', 'ONBOARDING', 'RE_ENGAGEMENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CampaignFollowUpCondition" AS ENUM ('NO_OPEN', 'NO_REPLY', 'NO_CLICK');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'FAILED');

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL DEFAULT 'COLD_OUTREACH',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "targetFilter" JSONB NOT NULL DEFAULT '{}',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEmail" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "subjectLine" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "autoFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "followUpCondition" "CampaignFollowUpCondition",

    CONSTRAINT "CampaignEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipientTracking" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignEmailId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'QUEUED',
    "sendAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "sendgridMessageId" TEXT,

    CONSTRAINT "CampaignRecipientTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnsubscribeToken" (
    "token" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnsubscribeToken_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "EmailCampaign_status_idx" ON "EmailCampaign"("status");

-- CreateIndex
CREATE INDEX "EmailCampaign_createdByUserId_idx" ON "EmailCampaign"("createdByUserId");

-- CreateIndex
CREATE INDEX "CampaignEmail_campaignId_idx" ON "CampaignEmail"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignEmail_campaignId_sequenceOrder_key" ON "CampaignEmail"("campaignId", "sequenceOrder");

-- CreateIndex
CREATE INDEX "CampaignRecipientTracking_campaignId_idx" ON "CampaignRecipientTracking"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignRecipientTracking_status_sendAfter_idx" ON "CampaignRecipientTracking"("status", "sendAfter");

-- CreateIndex
CREATE INDEX "CampaignRecipientTracking_sendgridMessageId_idx" ON "CampaignRecipientTracking"("sendgridMessageId");

-- CreateIndex
CREATE INDEX "CampaignRecipientTracking_companyId_idx" ON "CampaignRecipientTracking"("companyId");

-- CreateIndex
CREATE INDEX "CampaignRecipientTracking_contactId_idx" ON "CampaignRecipientTracking"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipientTracking_campaignEmailId_contactId_key" ON "CampaignRecipientTracking"("campaignEmailId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "UnsubscribeToken_contactId_key" ON "UnsubscribeToken"("contactId");

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEmail" ADD CONSTRAINT "CampaignEmail_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipientTracking" ADD CONSTRAINT "CampaignRecipientTracking_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipientTracking" ADD CONSTRAINT "CampaignRecipientTracking_campaignEmailId_fkey" FOREIGN KEY ("campaignEmailId") REFERENCES "CampaignEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipientTracking" ADD CONSTRAINT "CampaignRecipientTracking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipientTracking" ADD CONSTRAINT "CampaignRecipientTracking_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnsubscribeToken" ADD CONSTRAINT "UnsubscribeToken_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
