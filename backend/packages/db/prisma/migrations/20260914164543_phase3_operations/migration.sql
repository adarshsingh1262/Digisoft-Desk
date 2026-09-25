-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('TASK', 'CALL', 'EVENT');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "AssignmentStrategy" AS ENUM ('SPECIFIC_AGENT', 'DEPARTMENT', 'ROUND_ROBIN', 'LEAST_LOADED');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('TICKET_CREATED', 'TICKET_UPDATED', 'TICKET_ASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'CUSTOMER_REPLIED', 'AGENT_REPLIED', 'SLA_WARNING', 'SLA_BREACHED');

-- AlterTable
ALTER TABLE "ticket_statuses" ADD COLUMN     "pausesSla" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "firstResponseBreachedAt" TIMESTAMP(3),
ADD COLUMN     "firstResponseDueAt" TIMESTAMP(3),
ADD COLUMN     "firstResponseRemainingMin" INTEGER,
ADD COLUMN     "firstResponseWarnedAt" TIMESTAMP(3),
ADD COLUMN     "resolutionBreachedAt" TIMESTAMP(3),
ADD COLUMN     "resolutionDueAt" TIMESTAMP(3),
ADD COLUMN     "resolutionRemainingMin" INTEGER,
ADD COLUMN     "resolutionWarnedAt" TIMESTAMP(3),
ADD COLUMN     "slaPausedAt" TIMESTAMP(3),
ADD COLUMN     "slaPolicyId" TEXT;

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "callDirection" "CallDirection",
    "callDurationSeconds" INTEGER,
    "callOutcome" TEXT,
    "location" TEXT,
    "ticketId" TEXT,
    "contactId" TEXT,
    "accountId" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL,
    "strategy" "AssignmentStrategy" NOT NULL,
    "departmentId" TEXT,
    "teamId" TEXT,
    "agentId" TEXT,
    "lastAssignedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "trigger" "AutomationTrigger" NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ticketId" TEXT,
    "trigger" "AutomationTrigger" NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "actionsApplied" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL,
    "businessHoursId" TEXT,
    "warningMinutesBefore" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_targets" (
    "id" TEXT NOT NULL,
    "slaPolicyId" TEXT NOT NULL,
    "priorityId" TEXT,
    "firstResponseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "useBusinessHours" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sla_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blueprints" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blueprint_transitions" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT NOT NULL,
    "requiredFields" JSONB NOT NULL DEFAULT '[]',
    "allowedRoleIds" JSONB NOT NULL DEFAULT '[]',
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blueprint_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_organizationId_type_status_dueAt_idx" ON "activities"("organizationId", "type", "status", "dueAt");

-- CreateIndex
CREATE INDEX "activities_organizationId_ticketId_idx" ON "activities"("organizationId", "ticketId");

-- CreateIndex
CREATE INDEX "activities_organizationId_contactId_idx" ON "activities"("organizationId", "contactId");

-- CreateIndex
CREATE INDEX "activities_organizationId_accountId_idx" ON "activities"("organizationId", "accountId");

-- CreateIndex
CREATE INDEX "activities_organizationId_assignedToId_status_idx" ON "activities"("organizationId", "assignedToId", "status");

-- CreateIndex
CREATE INDEX "activities_organizationId_deletedAt_idx" ON "activities"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "assignment_rules_organizationId_isActive_position_idx" ON "assignment_rules"("organizationId", "isActive", "position");

-- CreateIndex
CREATE INDEX "automation_rules_organizationId_trigger_isActive_position_idx" ON "automation_rules"("organizationId", "trigger", "isActive", "position");

-- CreateIndex
CREATE INDEX "automation_runs_organizationId_ruleId_createdAt_idx" ON "automation_runs"("organizationId", "ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "automation_runs_organizationId_ticketId_createdAt_idx" ON "automation_runs"("organizationId", "ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "sla_policies_organizationId_isActive_position_idx" ON "sla_policies"("organizationId", "isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policies_organizationId_name_key" ON "sla_policies"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sla_targets_slaPolicyId_priorityId_key" ON "sla_targets"("slaPolicyId", "priorityId");

-- CreateIndex
CREATE INDEX "blueprints_organizationId_isActive_position_idx" ON "blueprints"("organizationId", "isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "blueprints_organizationId_name_key" ON "blueprints"("organizationId", "name");

-- CreateIndex
CREATE INDEX "blueprint_transitions_blueprintId_fromStatusId_idx" ON "blueprint_transitions"("blueprintId", "fromStatusId");

-- CreateIndex
CREATE INDEX "tickets_organizationId_firstResponseDueAt_idx" ON "tickets"("organizationId", "firstResponseDueAt");

-- CreateIndex
CREATE INDEX "tickets_organizationId_resolutionDueAt_idx" ON "tickets"("organizationId", "resolutionDueAt");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_businessHoursId_fkey" FOREIGN KEY ("businessHoursId") REFERENCES "business_hours"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_targets" ADD CONSTRAINT "sla_targets_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "sla_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_targets" ADD CONSTRAINT "sla_targets_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "ticket_priorities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blueprint_transitions" ADD CONSTRAINT "blueprint_transitions_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "blueprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blueprint_transitions" ADD CONSTRAINT "blueprint_transitions_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "ticket_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blueprint_transitions" ADD CONSTRAINT "blueprint_transitions_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "ticket_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
