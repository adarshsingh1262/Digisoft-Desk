-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('AGENT', 'PORTAL', 'WEB_FORM', 'EMAIL', 'CHAT', 'PHONE', 'API', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('PUBLIC_REPLY', 'INTERNAL_COMMENT', 'SYSTEM_NOTE');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "TicketLinkType" AS ENUM ('RELATED', 'DUPLICATE', 'BLOCKS');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "ticketSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ticket_statuses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemKey" TEXT,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_priorities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemKey" TEXT,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "weight" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_priorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" "TicketSource" NOT NULL DEFAULT 'AGENT',
    "contactId" TEXT,
    "accountId" TEXT,
    "departmentId" TEXT,
    "assignedAgentId" TEXT,
    "categoryId" TEXT,
    "statusId" TEXT NOT NULL,
    "priorityId" TEXT NOT NULL,
    "createdById" TEXT,
    "dueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "mergedIntoTicketId" TEXT,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_tags" (
    "ticketId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ticket_tags_pkey" PRIMARY KEY ("ticketId","tagId")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'PUBLIC_REPLY',
    "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
    "authorUserId" TEXT,
    "authorContactId" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "channel" "TicketSource" NOT NULL DEFAULT 'AGENT',
    "externalMessageId" TEXT,
    "inReplyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT,
    "messageId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_followers" (
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_followers_pkey" PRIMARY KEY ("ticketId","userId")
);

-- CreateTable
CREATE TABLE "ticket_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "linkedTicketId" TEXT NOT NULL,
    "type" "TicketLinkType" NOT NULL DEFAULT 'RELATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_statuses_organizationId_position_idx" ON "ticket_statuses"("organizationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_statuses_organizationId_name_key" ON "ticket_statuses"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_statuses_organizationId_systemKey_key" ON "ticket_statuses"("organizationId", "systemKey");

-- CreateIndex
CREATE INDEX "ticket_priorities_organizationId_position_idx" ON "ticket_priorities"("organizationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_priorities_organizationId_name_key" ON "ticket_priorities"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_priorities_organizationId_systemKey_key" ON "ticket_priorities"("organizationId", "systemKey");

-- CreateIndex
CREATE INDEX "ticket_categories_organizationId_deletedAt_idx" ON "ticket_categories"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_categories_organizationId_name_key" ON "ticket_categories"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_organizationId_name_key" ON "tags"("organizationId", "name");

-- CreateIndex
CREATE INDEX "tickets_organizationId_statusId_createdAt_idx" ON "tickets"("organizationId", "statusId", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_organizationId_priorityId_idx" ON "tickets"("organizationId", "priorityId");

-- CreateIndex
CREATE INDEX "tickets_organizationId_assignedAgentId_statusId_idx" ON "tickets"("organizationId", "assignedAgentId", "statusId");

-- CreateIndex
CREATE INDEX "tickets_organizationId_departmentId_statusId_idx" ON "tickets"("organizationId", "departmentId", "statusId");

-- CreateIndex
CREATE INDEX "tickets_organizationId_contactId_idx" ON "tickets"("organizationId", "contactId");

-- CreateIndex
CREATE INDEX "tickets_organizationId_accountId_idx" ON "tickets"("organizationId", "accountId");

-- CreateIndex
CREATE INDEX "tickets_organizationId_createdAt_idx" ON "tickets"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_organizationId_dueAt_idx" ON "tickets"("organizationId", "dueAt");

-- CreateIndex
CREATE INDEX "tickets_organizationId_deletedAt_idx" ON "tickets"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_organizationId_ticketNumber_key" ON "tickets"("organizationId", "ticketNumber");

-- CreateIndex
CREATE INDEX "ticket_tags_tagId_idx" ON "ticket_tags"("tagId");

-- CreateIndex
CREATE INDEX "ticket_messages_organizationId_ticketId_createdAt_idx" ON "ticket_messages"("organizationId", "ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_messages_organizationId_type_idx" ON "ticket_messages"("organizationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_messages_organizationId_externalMessageId_key" ON "ticket_messages"("organizationId", "externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_organizationId_ticketId_idx" ON "attachments"("organizationId", "ticketId");

-- CreateIndex
CREATE INDEX "attachments_organizationId_messageId_idx" ON "attachments"("organizationId", "messageId");

-- CreateIndex
CREATE INDEX "ticket_followers_userId_idx" ON "ticket_followers"("userId");

-- CreateIndex
CREATE INDEX "ticket_links_organizationId_linkedTicketId_idx" ON "ticket_links"("organizationId", "linkedTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_links_ticketId_linkedTicketId_key" ON "ticket_links"("ticketId", "linkedTicketId");

-- AddForeignKey
ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_priorities" ADD CONSTRAINT "ticket_priorities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ticket_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ticket_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ticket_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "ticket_priorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_mergedIntoTicketId_fkey" FOREIGN KEY ("mergedIntoTicketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tags" ADD CONSTRAINT "ticket_tags_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_tags" ADD CONSTRAINT "ticket_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_authorContactId_fkey" FOREIGN KEY ("authorContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_inReplyToId_fkey" FOREIGN KEY ("inReplyToId") REFERENCES "ticket_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ticket_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_followers" ADD CONSTRAINT "ticket_followers_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_followers" ADD CONSTRAINT "ticket_followers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
