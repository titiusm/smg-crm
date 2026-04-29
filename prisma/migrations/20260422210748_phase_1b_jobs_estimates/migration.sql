-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ESTIMATE_SENT', 'APPROVED', 'SCHEDULED', 'DETACH_COMPLETE', 'REINSTALL_COMPLETE', 'INVOICED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('DETACH_AND_REINSTALL', 'DETACH_ONLY', 'DIRECT_CUSTOMER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'ELIGIBLE', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EstimateType" AS ENUM ('INSURANCE_RETAIL', 'SUBCONTRACTOR');

-- CreateEnum
CREATE TYPE "EstimateSentTo" AS ENUM ('ROOFING_COMPANY', 'INSURANCE_COMPANY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditActionType" ADD VALUE 'JOB_CREATED';
ALTER TYPE "AuditActionType" ADD VALUE 'JOB_STATUS_CHANGED';
ALTER TYPE "AuditActionType" ADD VALUE 'JOB_CANCELLED';
ALTER TYPE "AuditActionType" ADD VALUE 'JOB_DELETED';
ALTER TYPE "AuditActionType" ADD VALUE 'ESTIMATE_CREATED';
ALTER TYPE "AuditActionType" ADD VALUE 'ESTIMATE_VERSIONED';
ALTER TYPE "AuditActionType" ADD VALUE 'ESTIMATE_SENT';
ALTER TYPE "AuditActionType" ADD VALUE 'COMMISSION_QUARTER_OVERRIDE';

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealId" TEXT,
    "contactId" TEXT,
    "assignedRepId" TEXT,
    "jobAddressStreet" TEXT,
    "jobAddressCity" TEXT,
    "jobAddressState" TEXT,
    "jobAddressZip" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'ESTIMATE_SENT',
    "statusHistory" JSONB NOT NULL DEFAULT '[]',
    "jobType" "JobType" NOT NULL DEFAULT 'DETACH_AND_REINSTALL',
    "panelCount" INTEGER,
    "pricePerPanel" DECIMAL(12,2),
    "insuranceEstimateTotal" DECIMAL(12,2),
    "subcontractorEstimateTotal" DECIMAL(12,2),
    "actualCost" DECIMAL(12,2),
    "profitSnapshot" DECIMAL(12,2),
    "profitSnapshotDate" TIMESTAMP(3),
    "revisedMarginNote" TEXT,
    "repCommission" DECIMAL(12,2),
    "commissionLocked" BOOLEAN NOT NULL DEFAULT false,
    "commissionStatus" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "commissionQuarter" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "insuranceCompanyName" TEXT,
    "insuranceCommunicationNotes" TEXT,
    "dateEstimateSent" TIMESTAMP(3),
    "dateApproved" TIMESTAMP(3),
    "dateDetachScheduled" TIMESTAMP(3),
    "dateDetachCompleted" TIMESTAMP(3),
    "dateReinstallCompleted" TIMESTAMP(3),
    "dateInvoiced" TIMESTAMP(3),
    "datePaid" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "estimateType" "EstimateType" NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isCurrentVersion" BOOLEAN NOT NULL DEFAULT true,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pdfFilePath" TEXT,
    "sentTo" "EstimateSentTo",
    "dateSent" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");

-- CreateIndex
CREATE INDEX "Job_assignedRepId_idx" ON "Job"("assignedRepId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_approvalStatus_idx" ON "Job"("approvalStatus");

-- CreateIndex
CREATE INDEX "Job_commissionStatus_idx" ON "Job"("commissionStatus");

-- CreateIndex
CREATE INDEX "Job_commissionQuarter_idx" ON "Job"("commissionQuarter");

-- CreateIndex
CREATE INDEX "Job_datePaid_idx" ON "Job"("datePaid");

-- CreateIndex
CREATE INDEX "Job_deletedAt_idx" ON "Job"("deletedAt");

-- CreateIndex
CREATE INDEX "Estimate_jobId_idx" ON "Estimate"("jobId");

-- CreateIndex
CREATE INDEX "Estimate_estimateType_idx" ON "Estimate"("estimateType");

-- CreateIndex
CREATE INDEX "Estimate_isCurrentVersion_idx" ON "Estimate"("isCurrentVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_jobId_estimateType_versionNumber_key" ON "Estimate"("jobId", "estimateType", "versionNumber");

-- CreateIndex
CREATE INDEX "EstimateLineItem_estimateId_idx" ON "EstimateLineItem"("estimateId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_assignedRepId_fkey" FOREIGN KEY ("assignedRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
