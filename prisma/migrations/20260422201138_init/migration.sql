-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'LIMITED_ADMIN', 'SALES_REP', 'REGIONAL_MANAGER');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('COLD', 'CONTACTED', 'INTERESTED', 'AGREED_TO_USE_US', 'FIRST_JOB_SENT', 'REPEAT_CUSTOMER', 'CLOSED_INACTIVE');

-- CreateEnum
CREATE TYPE "DealFlowTier" AS ENUM ('HIGH_VOLUME', 'MEDIUM_VOLUME', 'LOW_VOLUME', 'NEW_UNKNOWN');

-- CreateEnum
CREATE TYPE "CompanySource" AS ENUM ('CSV_IMPORT', 'MANUAL_ENTRY', 'INBOUND');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('FLAT_RATE_PER_PANEL', 'PERCENTAGE_OF_INSURANCE_PAYOUT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('SERVICE_TERMS', 'VOLUME_COMMITMENT', 'EXCLUSIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'TEXT', 'MEETING', 'NOTE', 'STATUS_CHANGE', 'COMPANY_INFO_UPDATE');

-- CreateEnum
CREATE TYPE "ActivityDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('IN_PERSON', 'PHONE', 'VIDEO');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('SENT', 'DELIVERED', 'BOUNCED', 'OPENED', 'CLICKED', 'REPLIED');

-- CreateEnum
CREATE TYPE "TextDeliveryStatus" AS ENUM ('SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('PRICE_OVERRIDE', 'COMMISSION_EDIT', 'COMMISSION_STRUCTURE_CHANGE', 'DEAL_CREATED', 'DEAL_MODIFIED', 'APPROVAL_DECISION', 'COMPANY_REASSIGNED', 'COMPANY_DELETED', 'ROLE_CHANGE', 'PERMISSION_CHANGE', 'COST_ENTRY', 'COST_EDIT', 'PROFIT_SNAPSHOT_LOCKED', 'DNC_FLAG_CHANGED', 'USER_INVITED', 'USER_DEACTIVATED', 'GLOBAL_SETTING_CHANGED', 'CSV_IMPORT');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('COMPANY', 'JOB', 'DEAL', 'USER', 'ESTIMATE', 'CONTACT', 'AGREEMENT', 'GLOBAL_SETTING', 'CSV_IMPORT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FOLLOW_UP_DUE', 'APPROVAL_NEEDED', 'COMPANY_REASSIGNED', 'REP_INACTIVE', 'GOAL_ALERT', 'DORMANT_COMPANY', 'CAMPAIGN_REPLY', 'COMMISSION_UPDATE', 'BACKWARD_STATUS_CHANGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CsvImportStatus" AS ENUM ('STAGED', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CsvImportRowAction" AS ENUM ('IMPORT_NEW', 'MERGE_WITH_EXISTING', 'SKIP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'SALES_REP',
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "commissionStructure" JSONB NOT NULL DEFAULT '{"type":"quarterly_revenue_tiers","base_rate":0.10,"tiers":[{"min":250000,"max":374999,"rate":0.12},{"min":375000,"max":499999,"rate":0.13},{"min":500000,"max":null,"rate":0.14}]}',
    "outreachTargets" JSONB NOT NULL DEFAULT '{"daily_calls":30,"daily_emails":20,"daily_texts":15}',
    "twilioPhoneNumber" TEXT,
    "hashedPassword" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "regionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'COLD',
    "phoneNumber" TEXT,
    "email" TEXT,
    "website" TEXT,
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZip" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "googleReviewCount" INTEGER,
    "googleRating" DOUBLE PRECISION,
    "yearEstablished" INTEGER,
    "employeeCount" INTEGER,
    "dealFlowTier" "DealFlowTier" NOT NULL DEFAULT 'NEW_UNKNOWN',
    "territory" TEXT,
    "assignedRepId" TEXT,
    "createdByUserId" TEXT,
    "nextActionType" TEXT,
    "nextActionDate" TIMESTAMP(3),
    "dateFirstContacted" TIMESTAMP(3),
    "dateLastContacted" TIMESTAMP(3),
    "dateLastProject" TIMESTAMP(3),
    "source" "CompanySource" NOT NULL DEFAULT 'MANUAL_ENTRY',
    "doNotCall" BOOLEAN NOT NULL DEFAULT false,
    "doNotEmail" BOOLEAN NOT NULL DEFAULT false,
    "doNotText" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "roleTitle" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "doNotCall" BOOLEAN NOT NULL DEFAULT false,
    "doNotEmail" BOOLEAN NOT NULL DEFAULT false,
    "doNotText" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "negotiatedByRepId" TEXT,
    "dealType" "DealType" NOT NULL,
    "pricingDetails" JSONB NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "termsNotes" TEXT,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "repId" TEXT,
    "agreementType" "AgreementType" NOT NULL,
    "description" TEXT NOT NULL,
    "termsSummary" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "status" "AgreementStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "repId" TEXT,
    "activityType" "ActivityType" NOT NULL,
    "direction" "ActivityDirection",
    "subject" TEXT,
    "detailedNotes" TEXT,
    "callRecordingUrl" TEXT,
    "callDurationSeconds" INTEGER,
    "callConnected" BOOLEAN,
    "countsAsActivity" BOOLEAN NOT NULL DEFAULT true,
    "meetingDate" TIMESTAMP(3),
    "meetingType" "MeetingType",
    "meetingOutcome" TEXT,
    "emailCampaignId" TEXT,
    "emailDeliveryStatus" "EmailDeliveryStatus",
    "textDeliveryStatus" "TextDeliveryStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItemMenu" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "defaultUnitPrice" DECIMAL(12,2) NOT NULL,
    "unitType" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineItemMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actionType" "AuditActionType" NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "GlobalSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CsvImport" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "importedByUserId" TEXT NOT NULL,
    "rowsTotal" INTEGER NOT NULL,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "duplicatesFound" INTEGER NOT NULL DEFAULT 0,
    "fieldMapping" JSONB NOT NULL,
    "status" "CsvImportStatus" NOT NULL DEFAULT 'STAGED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "CsvImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsvImportStagingRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "mappedData" JSONB NOT NULL,
    "rawData" JSONB NOT NULL,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "matchReason" TEXT,
    "matchCompanyId" TEXT,
    "action" "CsvImportRowAction" NOT NULL DEFAULT 'IMPORT_NEW',

    CONSTRAINT "CsvImportStagingRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_twilioPhoneNumber_key" ON "User"("twilioPhoneNumber");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "Company_companyName_idx" ON "Company"("companyName");

-- CreateIndex
CREATE INDEX "Company_status_idx" ON "Company"("status");

-- CreateIndex
CREATE INDEX "Company_assignedRepId_idx" ON "Company"("assignedRepId");

-- CreateIndex
CREATE INDEX "Company_addressCity_idx" ON "Company"("addressCity");

-- CreateIndex
CREATE INDEX "Company_addressState_idx" ON "Company"("addressState");

-- CreateIndex
CREATE INDEX "Company_addressZip_idx" ON "Company"("addressZip");

-- CreateIndex
CREATE INDEX "Company_dateLastContacted_idx" ON "Company"("dateLastContacted");

-- CreateIndex
CREATE INDEX "Company_dateLastProject_idx" ON "Company"("dateLastProject");

-- CreateIndex
CREATE INDEX "Company_nextActionDate_idx" ON "Company"("nextActionDate");

-- CreateIndex
CREATE INDEX "Company_googleReviewCount_idx" ON "Company"("googleReviewCount");

-- CreateIndex
CREATE INDEX "Company_doNotCall_idx" ON "Company"("doNotCall");

-- CreateIndex
CREATE INDEX "Company_doNotEmail_idx" ON "Company"("doNotEmail");

-- CreateIndex
CREATE INDEX "Company_doNotText_idx" ON "Company"("doNotText");

-- CreateIndex
CREATE INDEX "Company_deletedAt_idx" ON "Company"("deletedAt");

-- CreateIndex
CREATE INDEX "Company_phoneNumber_idx" ON "Company"("phoneNumber");

-- CreateIndex
CREATE INDEX "Company_email_idx" ON "Company"("email");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_phoneNumber_idx" ON "Contact"("phoneNumber");

-- CreateIndex
CREATE INDEX "Contact_isPrimaryContact_idx" ON "Contact"("isPrimaryContact");

-- CreateIndex
CREATE INDEX "Deal_companyId_idx" ON "Deal"("companyId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "Deal_effectiveDate_idx" ON "Deal"("effectiveDate");

-- CreateIndex
CREATE INDEX "Deal_expirationDate_idx" ON "Deal"("expirationDate");

-- CreateIndex
CREATE INDEX "Agreement_companyId_idx" ON "Agreement"("companyId");

-- CreateIndex
CREATE INDEX "Agreement_status_idx" ON "Agreement"("status");

-- CreateIndex
CREATE INDEX "Activity_companyId_idx" ON "Activity"("companyId");

-- CreateIndex
CREATE INDEX "Activity_contactId_idx" ON "Activity"("contactId");

-- CreateIndex
CREATE INDEX "Activity_repId_idx" ON "Activity"("repId");

-- CreateIndex
CREATE INDEX "Activity_activityType_idx" ON "Activity"("activityType");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LineItemMenu_itemName_key" ON "LineItemMenu"("itemName");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actionType_idx" ON "AuditLog"("actionType");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "CsvImport_importedByUserId_idx" ON "CsvImport"("importedByUserId");

-- CreateIndex
CREATE INDEX "CsvImport_createdAt_idx" ON "CsvImport"("createdAt");

-- CreateIndex
CREATE INDEX "CsvImportStagingRow_importId_idx" ON "CsvImportStagingRow"("importId");

-- CreateIndex
CREATE INDEX "CsvImportStagingRow_isDuplicate_idx" ON "CsvImportStagingRow"("isDuplicate");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_assignedRepId_fkey" FOREIGN KEY ("assignedRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_negotiatedByRepId_fkey" FOREIGN KEY ("negotiatedByRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsvImport" ADD CONSTRAINT "CsvImport_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsvImportStagingRow" ADD CONSTRAINT "CsvImportStagingRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "CsvImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
