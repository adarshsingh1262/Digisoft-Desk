-- CreateEnum
CREATE TYPE "AiProviderKind" AS ENUM ('ANTHROPIC', 'HEURISTIC');

-- CreateEnum
CREATE TYPE "AiInsightType" AS ENUM ('SUMMARY', 'SENTIMENT', 'INTENT', 'SUGGESTED_REPLY', 'KB_SUGGESTIONS');

-- CreateEnum
CREATE TYPE "AiInsightStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "ai_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "AiProviderKind" NOT NULL DEFAULT 'HEURISTIC',
    "model" TEXT NOT NULL DEFAULT 'claude-opus-5',
    "secrets" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "summaryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sentimentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "intentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "suggestedReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoAnalyse" BOOLEAN NOT NULL DEFAULT true,
    "monthlyTokenBudget" INTEGER NOT NULL DEFAULT 0,
    "promptGuidance" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" "AiInsightType" NOT NULL,
    "status" "AiInsightStatus" NOT NULL DEFAULT 'READY',
    "content" JSONB NOT NULL,
    "provider" "AiProviderKind" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_settings_organizationId_key" ON "ai_settings"("organizationId");

-- CreateIndex
CREATE INDEX "ai_insights_organizationId_ticketId_type_createdAt_idx" ON "ai_insights"("organizationId", "ticketId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ai_insights_organizationId_createdAt_idx" ON "ai_insights"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

