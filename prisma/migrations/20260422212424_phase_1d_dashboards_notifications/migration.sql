-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "layout" JSONB NOT NULL,
    "widgets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "repActivity" TEXT NOT NULL DEFAULT 'weekly',
    "dealUpdates" TEXT NOT NULL DEFAULT 'daily',
    "campaignStats" TEXT NOT NULL DEFAULT 'weekly',
    "followUpReminders" TEXT NOT NULL DEFAULT 'daily',
    "commissionUpdates" TEXT NOT NULL DEFAULT 'daily',
    "approvalRequests" TEXT NOT NULL DEFAULT 'daily',
    "dormantCompanies" TEXT NOT NULL DEFAULT 'weekly',
    "inAppAll" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "NotificationScanToken" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationScanToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardLayout_userId_isDefault_idx" ON "DashboardLayout"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "NotificationScanToken_kind_firedAt_idx" ON "NotificationScanToken"("kind", "firedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationScanToken_kind_subjectId_key" ON "NotificationScanToken"("kind", "subjectId");

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
