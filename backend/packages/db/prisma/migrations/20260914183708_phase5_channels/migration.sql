-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('EMAIL', 'CHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'TELEGRAM', 'VOICE');

-- CreateEnum
CREATE TYPE "ChannelEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatSessionStatus" AS ENUM ('QUEUED', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "externalCallId" TEXT,
ADD COLUMN     "recordingUrl" TEXT;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "channelId" TEXT;

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "identifier" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "webhookSecret" TEXT,
    "departmentId" TEXT,
    "priorityId" TEXT,
    "categoryId" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_identities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT,
    "type" "ChannelType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "ChannelEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "ticketId" TEXT,
    "messageId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT,
    "ticketId" TEXT,
    "contactId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" "ChatSessionStatus" NOT NULL DEFAULT 'QUEUED',
    "visitorName" TEXT,
    "visitorEmail" TEXT,
    "pageUrl" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channels_organizationId_type_isActive_idx" ON "channels"("organizationId", "type", "isActive");

-- CreateIndex
CREATE INDEX "channels_organizationId_deletedAt_idx" ON "channels"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "channels_organizationId_type_identifier_key" ON "channels"("organizationId", "type", "identifier");

-- CreateIndex
CREATE INDEX "channel_identities_organizationId_contactId_idx" ON "channel_identities"("organizationId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_identities_organizationId_type_externalId_key" ON "channel_identities"("organizationId", "type", "externalId");

-- CreateIndex
CREATE INDEX "channel_events_organizationId_status_createdAt_idx" ON "channel_events"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "channel_events_channelId_externalId_key" ON "channel_events"("channelId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_tokenHash_key" ON "chat_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "chat_sessions_organizationId_status_lastSeenAt_idx" ON "chat_sessions"("organizationId", "status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "chat_sessions_organizationId_ticketId_idx" ON "chat_sessions"("organizationId", "ticketId");

-- CreateIndex
CREATE INDEX "webhook_endpoints_organizationId_isActive_idx" ON "webhook_endpoints"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "webhook_endpoints_organizationId_deletedAt_idx" ON "webhook_endpoints"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_organizationId_endpointId_createdAt_idx" ON "webhook_deliveries"("organizationId", "endpointId", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_organizationId_status_idx" ON "webhook_deliveries"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_userId_key" ON "api_keys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_revokedAt_idx" ON "api_keys"("organizationId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "activities_organizationId_externalCallId_key" ON "activities"("organizationId", "externalCallId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "ticket_priorities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ticket_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_events" ADD CONSTRAINT "channel_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_events" ADD CONSTRAINT "channel_events_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

