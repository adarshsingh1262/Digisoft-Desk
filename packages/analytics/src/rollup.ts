import { addDays, eachDay, startOfUtcDay } from './range';
import type { AnalyticsDeps, DateRange } from './types';

interface TicketRow {
  departmentId: string | null;
  created: bigint;
  resolved: bigint;
  closed: bigint;
  firstResponses: bigint;
  slaFirstMet: bigint;
  slaFirstBreach: bigint;
  slaResMet: bigint;
  slaResBreach: bigint;
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
}

interface ReopenRow {
  departmentId: string | null;
  reopened: bigint;
}

interface AgentTicketRow {
  agentId: string;
  resolved: bigint;
  resolutionMinutes: number | null;
}

interface AgentReplyRow {
  agentId: string;
  publicReplies: bigint;
}

interface AgentFirstResponseRow {
  agentId: string;
  firstResponses: bigint;
  firstResponseMinutes: number | null;
}

interface AgentAssignRow {
  agentId: string;
  assigned: bigint;
}

interface AgentCsatRow {
  agentId: string;
  responses: bigint;
  ratingSum: bigint | null;
}

const num = (value: bigint | number | null | undefined): number =>
  value === null || value === undefined ? 0 : Math.round(Number(value));

/**
 * Recomputes one UTC day for one organization, replacing whatever was there. Rerunning
 * a day is therefore always safe — the worker re-rolls recent days on every sweep,
 * because a ticket resolved today changes yesterday's numbers when the clock crosses
 * midnight mid-conversation.
 */
export async function rollupDay(
  deps: AnalyticsDeps,
  organizationId: string,
  day: Date,
): Promise<{ departments: number; agents: number }> {
  const from = startOfUtcDay(day);
  const to = addDays(from, 1);

  const ticketRows = await deps.prisma.$queryRaw<TicketRow[]>`
    SELECT
      "departmentId",
      COUNT(*) FILTER (WHERE "createdAt" >= ${from} AND "createdAt" < ${to}) AS "created",
      COUNT(*) FILTER (WHERE "resolvedAt" >= ${from} AND "resolvedAt" < ${to}) AS "resolved",
      COUNT(*) FILTER (WHERE "closedAt" >= ${from} AND "closedAt" < ${to}) AS "closed",
      COUNT(*) FILTER (WHERE "firstResponseAt" >= ${from} AND "firstResponseAt" < ${to}) AS "firstResponses",
      COUNT(*) FILTER (
        WHERE "firstResponseAt" >= ${from} AND "firstResponseAt" < ${to}
          AND "firstResponseDueAt" IS NOT NULL AND "firstResponseAt" <= "firstResponseDueAt"
      ) AS "slaFirstMet",
      COUNT(*) FILTER (
        WHERE "firstResponseBreachedAt" >= ${from} AND "firstResponseBreachedAt" < ${to}
      ) AS "slaFirstBreach",
      COUNT(*) FILTER (
        WHERE "resolvedAt" >= ${from} AND "resolvedAt" < ${to}
          AND "resolutionDueAt" IS NOT NULL AND "resolvedAt" <= "resolutionDueAt"
      ) AS "slaResMet",
      COUNT(*) FILTER (
        WHERE "resolutionBreachedAt" >= ${from} AND "resolutionBreachedAt" < ${to}
      ) AS "slaResBreach",
      COALESCE(SUM(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) / 60)
        FILTER (WHERE "firstResponseAt" >= ${from} AND "firstResponseAt" < ${to}), 0) AS "firstResponseMinutes",
      COALESCE(SUM(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 60)
        FILTER (WHERE "resolvedAt" >= ${from} AND "resolvedAt" < ${to}), 0) AS "resolutionMinutes"
    FROM tickets
    WHERE "organizationId" = ${organizationId}
      AND "deletedAt" IS NULL
      AND (
        ("createdAt" >= ${from} AND "createdAt" < ${to})
        OR ("resolvedAt" >= ${from} AND "resolvedAt" < ${to})
        OR ("closedAt" >= ${from} AND "closedAt" < ${to})
        OR ("firstResponseAt" >= ${from} AND "firstResponseAt" < ${to})
        OR ("firstResponseBreachedAt" >= ${from} AND "firstResponseBreachedAt" < ${to})
        OR ("resolutionBreachedAt" >= ${from} AND "resolutionBreachedAt" < ${to})
      )
    GROUP BY "departmentId"
  `;

  // A reopen is an audit fact, not a column: an agent reopening a resolved ticket and a
  // customer reply that reopens one both count.
  const reopenRows = await deps.prisma.$queryRaw<ReopenRow[]>`
    SELECT t."departmentId", COUNT(*) AS "reopened"
    FROM audit_logs a
    JOIN tickets t ON t.id = a."entityId" AND t."organizationId" = a."organizationId"
    WHERE a."organizationId" = ${organizationId}
      AND a.entity = 'Ticket'
      AND a."createdAt" >= ${from} AND a."createdAt" < ${to}
      AND (
        a.action = 'ticket.reopened'
        OR (a.action = 'ticket.customer_replied' AND a."newValue"->>'reopened' = 'true')
      )
    GROUP BY t."departmentId"
  `;

  const reopenFor = (row: TicketRow): number =>
    num(reopenRows.find((candidate) => candidate.departmentId === row.departmentId)?.reopened);

  // Reopens can land on a day with no other ticket movement, so days that only have
  // reopens still get a row.
  const orphanReopens = reopenRows.filter(
    (reopen) => !ticketRows.some((row) => row.departmentId === reopen.departmentId),
  );

  const ticketMetrics = [
    ...ticketRows.map((row) => ({
      departmentId: row.departmentId,
      created: num(row.created),
      resolved: num(row.resolved),
      closed: num(row.closed),
      reopened: reopenFor(row),
      firstResponses: num(row.firstResponses),
      slaFirstMet: num(row.slaFirstMet),
      slaFirstBreach: num(row.slaFirstBreach),
      slaResMet: num(row.slaResMet),
      slaResBreach: num(row.slaResBreach),
      firstResponseMinutes: num(row.firstResponseMinutes),
      resolutionMinutes: num(row.resolutionMinutes),
      resolutionSamples: num(row.resolved),
    })),
    ...orphanReopens.map((row) => ({
      departmentId: row.departmentId,
      created: 0,
      resolved: 0,
      closed: 0,
      reopened: num(row.reopened),
      firstResponses: 0,
      slaFirstMet: 0,
      slaFirstBreach: 0,
      slaResMet: 0,
      slaResBreach: 0,
      firstResponseMinutes: 0,
      resolutionMinutes: 0,
      resolutionSamples: 0,
    })),
  ];

  const [agentTickets, agentReplies, agentFirstResponses, agentAssignments, agentCsat] =
    await Promise.all([
      deps.prisma.$queryRaw<AgentTicketRow[]>`
        SELECT
          "assignedAgentId" AS "agentId",
          COUNT(*) FILTER (WHERE "resolvedAt" >= ${from} AND "resolvedAt" < ${to}) AS "resolved",
          COALESCE(SUM(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 60)
            FILTER (WHERE "resolvedAt" >= ${from} AND "resolvedAt" < ${to}), 0) AS "resolutionMinutes"
        FROM tickets
        WHERE "organizationId" = ${organizationId}
          AND "deletedAt" IS NULL
          AND "assignedAgentId" IS NOT NULL
          AND "resolvedAt" >= ${from} AND "resolvedAt" < ${to}
        GROUP BY "assignedAgentId"
      `,
      deps.prisma.$queryRaw<AgentReplyRow[]>`
        SELECT "authorUserId" AS "agentId", COUNT(*) AS "publicReplies"
        FROM ticket_messages
        WHERE "organizationId" = ${organizationId}
          AND "authorUserId" IS NOT NULL
          AND type = 'PUBLIC_REPLY'
          AND direction = 'OUTBOUND'
          AND "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY "authorUserId"
      `,
      // The first response is credited to whoever actually wrote it, which is not always
      // the agent the ticket ended up assigned to.
      deps.prisma.$queryRaw<AgentFirstResponseRow[]>`
        SELECT
          m."authorUserId" AS "agentId",
          COUNT(*) AS "firstResponses",
          COALESCE(SUM(EXTRACT(EPOCH FROM (t."firstResponseAt" - t."createdAt")) / 60), 0) AS "firstResponseMinutes"
        FROM tickets t
        JOIN ticket_messages m
          ON m."ticketId" = t.id
         AND m."organizationId" = t."organizationId"
         AND m."createdAt" = t."firstResponseAt"
         AND m.type = 'PUBLIC_REPLY'
         AND m."authorUserId" IS NOT NULL
        WHERE t."organizationId" = ${organizationId}
          AND t."deletedAt" IS NULL
          AND t."firstResponseAt" >= ${from} AND t."firstResponseAt" < ${to}
        GROUP BY m."authorUserId"
      `,
      deps.prisma.$queryRaw<AgentAssignRow[]>`
        SELECT a."newValue"->>'assignedAgentId' AS "agentId", COUNT(*) AS "assigned"
        FROM audit_logs a
        WHERE a."organizationId" = ${organizationId}
          AND a.entity = 'Ticket'
          AND a.action = 'ticket.assigned'
          AND a."createdAt" >= ${from} AND a."createdAt" < ${to}
          AND a."newValue"->>'assignedAgentId' IS NOT NULL
        GROUP BY a."newValue"->>'assignedAgentId'
      `,
      deps.prisma.$queryRaw<AgentCsatRow[]>`
        SELECT "agentId", COUNT(*) AS "responses", COALESCE(SUM(rating), 0) AS "ratingSum"
        FROM csat_responses
        WHERE "organizationId" = ${organizationId}
          AND "agentId" IS NOT NULL
          AND status = 'ANSWERED'
          AND "respondedAt" >= ${from} AND "respondedAt" < ${to}
        GROUP BY "agentId"
      `,
    ]);

  const agentIds = new Set<string>([
    ...agentTickets.map((row) => row.agentId),
    ...agentReplies.map((row) => row.agentId),
    ...agentFirstResponses.map((row) => row.agentId),
    ...agentAssignments.map((row) => row.agentId),
    ...agentCsat.map((row) => row.agentId),
  ]);

  // An assignment audit row can name an agent who has since been deleted; the write
  // below would fail its foreign key, so only agents that still exist are rolled up.
  const liveAgents =
    agentIds.size === 0
      ? []
      : await deps.prisma.user.findMany({
          where: { organizationId, id: { in: [...agentIds] } },
          select: { id: true },
        });
  const liveAgentIds = new Set(liveAgents.map((agent) => agent.id));

  await deps.prisma.$transaction([
    deps.prisma.ticketDailyMetric.deleteMany({ where: { organizationId, day: from } }),
    ...ticketMetrics.map((metric) =>
      deps.prisma.ticketDailyMetric.create({
        data: {
          organizationId,
          day: from,
          departmentId: metric.departmentId,
          created: metric.created,
          resolved: metric.resolved,
          closed: metric.closed,
          reopened: metric.reopened,
          firstResponses: metric.firstResponses,
          slaFirstMet: metric.slaFirstMet,
          slaFirstBreach: metric.slaFirstBreach,
          slaResMet: metric.slaResMet,
          slaResBreach: metric.slaResBreach,
          firstResponseMinutes: metric.firstResponseMinutes,
          resolutionMinutes: metric.resolutionMinutes,
          resolutionSamples: metric.resolutionSamples,
        },
      }),
    ),
    deps.prisma.agentDailyMetric.deleteMany({ where: { organizationId, day: from } }),
    ...[...liveAgentIds].map((agentId) => {
      const tickets = agentTickets.find((row) => row.agentId === agentId);
      const replies = agentReplies.find((row) => row.agentId === agentId);
      const responses = agentFirstResponses.find((row) => row.agentId === agentId);
      const assignments = agentAssignments.find((row) => row.agentId === agentId);
      const csat = agentCsat.find((row) => row.agentId === agentId);
      return deps.prisma.agentDailyMetric.create({
        data: {
          organizationId,
          day: from,
          agentId,
          assigned: num(assignments?.assigned),
          resolved: num(tickets?.resolved),
          publicReplies: num(replies?.publicReplies),
          firstResponses: num(responses?.firstResponses),
          firstResponseMinutes: num(responses?.firstResponseMinutes),
          resolutionMinutes: num(tickets?.resolutionMinutes),
          resolutionSamples: num(tickets?.resolved),
          csatResponses: num(csat?.responses),
          csatRatingSum: num(csat?.ratingSum),
        },
      });
    }),
  ]);

  return { departments: ticketMetrics.length, agents: liveAgentIds.size };
}

/** Recomputes every day in the range for one organization. */
export async function rollupRange(
  deps: AnalyticsDeps,
  organizationId: string,
  range: DateRange,
): Promise<{ days: number }> {
  const days = eachDay(range);
  for (const day of days) {
    await rollupDay(deps, organizationId, day);
  }
  return { days: days.length };
}

/**
 * The worker's sweep: re-roll the last `days` days for every live organization. Recent
 * days are recomputed rather than appended to, because a ticket resolved today changes
 * the day it was created on.
 */
export async function rollupRecent(
  deps: AnalyticsDeps,
  days = 2,
  now: Date = new Date(),
): Promise<{ organizations: number; days: number }> {
  const organizations = await deps.prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  const today = startOfUtcDay(now);
  const from = addDays(today, -(days - 1));

  for (const organization of organizations) {
    try {
      await rollupRange(deps, organization.id, { from, to: addDays(today, 1) });
    } catch (error) {
      // One organization's bad day must not stop the sweep for everyone else.
      deps.log?.('error', 'Metric rollup failed', {
        organizationId: organization.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { organizations: organizations.length, days };
}

/**
 * Makes sure the recent rollups exist before a report reads them. The sweep runs on a
 * timer, so without this a dashboard opened five minutes after a ticket was resolved
 * would show yesterday's picture; a report must never depend on the worker's schedule.
 *
 * Only today and yesterday are checked — older days cannot change without a write that
 * the sweep already covered.
 */
export async function ensureRecentRollup(
  deps: AnalyticsDeps,
  organizationId: string,
  range: DateRange,
  now: Date = new Date(),
  maxAgeMs = 120_000,
): Promise<void> {
  const today = startOfUtcDay(now);
  const candidates = [addDays(today, -1), today].filter(
    (day) => day >= startOfUtcDay(range.from) && day < range.to,
  );
  if (candidates.length === 0) return;

  const existing = await deps.prisma.ticketDailyMetric.findMany({
    where: { organizationId, day: { in: candidates } },
    select: { day: true, computedAt: true },
  });

  for (const day of candidates) {
    const rows = existing.filter((row) => row.day.getTime() === day.getTime());
    const freshest = rows.reduce<number>((max, row) => Math.max(max, row.computedAt.getTime()), 0);
    if (rows.length > 0 && now.getTime() - freshest < maxAgeMs) continue;
    await rollupDay(deps, organizationId, day);
  }
}
