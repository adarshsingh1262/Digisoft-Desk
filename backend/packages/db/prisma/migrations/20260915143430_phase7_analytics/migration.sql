-- CreateEnum
CREATE TYPE "CsatStatus" AS ENUM ('PENDING', 'ANSWERED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('TICKETS', 'AGENTS', 'SLA', 'CSAT');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "csat_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "delayMinutes" INTEGER NOT NULL DEFAULT 60,
    "expiryDays" INTEGER NOT NULL DEFAULT 14,
    "subject" TEXT NOT NULL DEFAULT 'How did we do?',
    "introText" TEXT NOT NULL DEFAULT 'Please rate the support you received. It takes a few seconds.',
    "thankYouText" TEXT NOT NULL DEFAULT 'Thank you — your feedback goes straight to the team that helped you.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "csat_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csat_responses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "contactId" TEXT,
    "agentId" TEXT,
    "departmentId" TEXT,
    "status" "CsatStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "csat_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_definitions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "filters" JSONB NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "filters" JSONB NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "storageKey" TEXT,
    "fileName" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_daily_metrics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "departmentId" TEXT,
    "created" INTEGER NOT NULL DEFAULT 0,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "closed" INTEGER NOT NULL DEFAULT 0,
    "reopened" INTEGER NOT NULL DEFAULT 0,
    "firstResponses" INTEGER NOT NULL DEFAULT 0,
    "slaFirstMet" INTEGER NOT NULL DEFAULT 0,
    "slaFirstBreach" INTEGER NOT NULL DEFAULT 0,
    "slaResMet" INTEGER NOT NULL DEFAULT 0,
    "slaResBreach" INTEGER NOT NULL DEFAULT 0,
    "firstResponseMinutes" INTEGER NOT NULL DEFAULT 0,
    "resolutionMinutes" INTEGER NOT NULL DEFAULT 0,
    "resolutionSamples" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_daily_metrics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "agentId" TEXT NOT NULL,
    "assigned" INTEGER NOT NULL DEFAULT 0,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "publicReplies" INTEGER NOT NULL DEFAULT 0,
    "firstResponses" INTEGER NOT NULL DEFAULT 0,
    "firstResponseMinutes" INTEGER NOT NULL DEFAULT 0,
    "resolutionMinutes" INTEGER NOT NULL DEFAULT 0,
    "resolutionSamples" INTEGER NOT NULL DEFAULT 0,
    "csatResponses" INTEGER NOT NULL DEFAULT 0,
    "csatRatingSum" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "csat_settings_organizationId_key" ON "csat_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "csat_responses_ticketId_key" ON "csat_responses"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "csat_responses_tokenHash_key" ON "csat_responses"("tokenHash");

-- CreateIndex
CREATE INDEX "csat_responses_organizationId_status_respondedAt_idx" ON "csat_responses"("organizationId", "status", "respondedAt");

-- CreateIndex
CREATE INDEX "csat_responses_organizationId_agentId_respondedAt_idx" ON "csat_responses"("organizationId", "agentId", "respondedAt");

-- CreateIndex
CREATE UNIQUE INDEX "csat_responses_organizationId_ticketId_key" ON "csat_responses"("organizationId", "ticketId");

-- CreateIndex
CREATE INDEX "report_definitions_organizationId_kind_idx" ON "report_definitions"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "report_definitions_organizationId_name_key" ON "report_definitions"("organizationId", "name");

-- CreateIndex
CREATE INDEX "report_exports_organizationId_createdAt_idx" ON "report_exports"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_daily_metrics_organizationId_day_idx" ON "ticket_daily_metrics"("organizationId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_daily_metrics_organizationId_day_departmentId_key" ON "ticket_daily_metrics"("organizationId", "day", "departmentId");

-- CreateIndex
CREATE INDEX "agent_daily_metrics_organizationId_day_idx" ON "agent_daily_metrics"("organizationId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "agent_daily_metrics_organizationId_day_agentId_key" ON "agent_daily_metrics"("organizationId", "day", "agentId");

-- AddForeignKey
ALTER TABLE "csat_settings" ADD CONSTRAINT "csat_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_daily_metrics" ADD CONSTRAINT "ticket_daily_metrics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_daily_metrics" ADD CONSTRAINT "ticket_daily_metrics_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_daily_metrics" ADD CONSTRAINT "agent_daily_metrics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_daily_metrics" ADD CONSTRAINT "agent_daily_metrics_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
