import type { AnalyticsQuery } from '@digisoft/shared';
import { addDays, average, dayKey, eachDay, percentage, resolveRange, startOfUtcDay } from './range';
import type { AnalyticsDeps, DateRange } from './types';

export interface TrendPoint {
  day: string;
  created: number;
  resolved: number;
  closed: number;
  reopened: number;
}

export interface TicketReport {
  range: { from: string; to: string };
  totals: {
    created: number;
    resolved: number;
    closed: number;
    reopened: number;
    open: number;
    unassigned: number;
    overdue: number;
    avgFirstResponseMinutes: number | null;
    avgResolutionMinutes: number | null;
    resolutionRate: number | null;
  };
  trend: TrendPoint[];
  byPriority: { id: string; name: string; colour: string | null; count: number }[];
  byStatus: { id: string; name: string; colour: string | null; count: number }[];
  byChannel: { channel: string; count: number }[];
  byDepartment: { id: string | null; name: string; created: number; resolved: number }[];
}

export interface AgentReportRow {
  agentId: string;
  name: string;
  email: string;
  assigned: number;
  resolved: number;
  publicReplies: number;
  firstResponses: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  csatResponses: number;
  csatAverage: number | null;
  openNow: number;
}

export interface AgentReport {
  range: { from: string; to: string };
  rows: AgentReportRow[];
}

export interface SlaReport {
  range: { from: string; to: string };
  totals: {
    firstResponses: number;
    firstResponseMet: number;
    firstResponseBreached: number;
    firstResponseCompliance: number | null;
    resolutions: number;
    resolutionMet: number;
    resolutionBreached: number;
    resolutionCompliance: number | null;
    atRisk: number;
    breachedOpen: number;
  };
  trend: {
    day: string;
    firstResponseMet: number;
    firstResponseBreached: number;
    resolutionMet: number;
    resolutionBreached: number;
  }[];
  byPolicy: {
    id: string;
    name: string;
    firstResponseBreached: number;
    resolutionBreached: number;
    tickets: number;
  }[];
}

export interface CsatReport {
  range: { from: string; to: string };
  totals: {
    sent: number;
    responses: number;
    responseRate: number | null;
    average: number | null;
    positive: number;
    neutral: number;
    negative: number;
    satisfactionRate: number | null;
  };
  distribution: { rating: number; count: number }[];
  trend: { day: string; responses: number; average: number | null }[];
  byAgent: { agentId: string; name: string; responses: number; average: number | null }[];
  comments: {
    id: string;
    rating: number;
    comment: string;
    respondedAt: string;
    ticketId: string;
    ticketNumber: number;
    subject: string;
    contactName: string | null;
  }[];
}

interface Filters {
  departmentId?: string;
  agentId?: string;
  priorityId?: string;
  channelId?: string;
}

const iso = (value: Date) => value.toISOString();

/** Ticket-table filter shared by every live (non-rollup) query. */
function ticketWhere(organizationId: string, filters: Filters) {
  return {
    organizationId,
    deletedAt: null,
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.agentId ? { assignedAgentId: filters.agentId } : {}),
    ...(filters.priorityId ? { priorityId: filters.priorityId } : {}),
    ...(filters.channelId ? { channelId: filters.channelId } : {}),
  };
}

/**
 * Whether the rollup tables can answer this question. They are aggregated by day and
 * department only, so any narrower filter falls back to the ticket table — the numbers
 * are the same either way, one is just cheaper.
 */
function rollupUsable(filters: Filters): boolean {
  return !filters.agentId && !filters.priorityId && !filters.channelId;
}

export async function ticketReport(
  deps: AnalyticsDeps,
  organizationId: string,
  query: AnalyticsQuery,
  now: Date = new Date(),
): Promise<TicketReport> {
  const range = resolveRange(query, now);
  const filters: Filters = {
    departmentId: query.departmentId,
    agentId: query.agentId,
    priorityId: query.priorityId,
    channelId: query.channelId,
  };
  const where = ticketWhere(organizationId, filters);
  const inRange = { gte: range.from, lt: range.to };

  const [
    trend,
    created,
    resolved,
    closed,
    durations,
    openNow,
    unassigned,
    overdue,
    priorities,
    statuses,
    channels,
    departments,
  ] = await Promise.all([
    trendSeries(deps, organizationId, range, filters),
    deps.prisma.ticket.count({ where: { ...where, createdAt: inRange } }),
    deps.prisma.ticket.count({ where: { ...where, resolvedAt: inRange } }),
    deps.prisma.ticket.count({ where: { ...where, closedAt: inRange } }),
    durationTotals(deps, organizationId, range, filters),
    deps.prisma.ticket.count({ where: { ...where, closedAt: null, resolvedAt: null } }),
    deps.prisma.ticket.count({
      where: { ...where, assignedAgentId: null, closedAt: null, resolvedAt: null },
    }),
    deps.prisma.ticket.count({
      where: { ...where, resolvedAt: null, closedAt: null, dueAt: { lt: now } },
    }),
    deps.prisma.ticket.groupBy({
      by: ['priorityId'],
      where: { ...where, createdAt: inRange },
      _count: { _all: true },
    }),
    deps.prisma.ticket.groupBy({
      by: ['statusId'],
      where: { ...where, closedAt: null },
      _count: { _all: true },
    }),
    deps.prisma.ticket.groupBy({
      by: ['source'],
      where: { ...where, createdAt: inRange },
      _count: { _all: true },
    }),
    deps.prisma.ticket.groupBy({
      by: ['departmentId'],
      where: { ...ticketWhere(organizationId, { ...filters, departmentId: undefined }), createdAt: inRange },
      _count: { _all: true },
    }),
  ]);

  const [priorityRows, statusRows, departmentRows, resolvedByDepartment] = await Promise.all([
    deps.prisma.ticketPriority.findMany({
      where: { organizationId },
      select: { id: true, name: true, color: true, position: true },
      orderBy: { position: 'asc' },
    }),
    deps.prisma.ticketStatus.findMany({
      where: { organizationId },
      select: { id: true, name: true, color: true, position: true },
      orderBy: { position: 'asc' },
    }),
    deps.prisma.department.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
    }),
    deps.prisma.ticket.groupBy({
      by: ['departmentId'],
      where: { ...ticketWhere(organizationId, { ...filters, departmentId: undefined }), resolvedAt: inRange },
      _count: { _all: true },
    }),
  ]);

  return {
    range: { from: iso(range.from), to: iso(range.to) },
    totals: {
      created,
      resolved,
      closed,
      reopened: trend.reduce((sum, point) => sum + point.reopened, 0),
      open: openNow,
      unassigned,
      overdue,
      avgFirstResponseMinutes: average(durations.firstResponseMinutes, durations.firstResponses),
      avgResolutionMinutes: average(durations.resolutionMinutes, durations.resolutionSamples),
      resolutionRate: percentage(resolved, created),
    },
    trend,
    byPriority: priorityRows
      .map((priority) => ({
        id: priority.id,
        name: priority.name,
        colour: priority.color,
        count: priorities.find((row) => row.priorityId === priority.id)?._count._all ?? 0,
      }))
      .filter((row) => row.count > 0),
    byStatus: statusRows
      .map((status) => ({
        id: status.id,
        name: status.name,
        colour: status.color,
        count: statuses.find((row) => row.statusId === status.id)?._count._all ?? 0,
      }))
      .filter((row) => row.count > 0),
    byChannel: channels
      .map((row) => ({ channel: row.source, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    byDepartment: departments
      .map((row) => ({
        id: row.departmentId,
        name: row.departmentId
          ? (departmentRows.find((department) => department.id === row.departmentId)?.name ??
            'Deleted department')
          : 'Unassigned',
        created: row._count._all,
        resolved:
          resolvedByDepartment.find((resolvedRow) => resolvedRow.departmentId === row.departmentId)
            ?._count._all ?? 0,
      }))
      .sort((a, b) => b.created - a.created),
  };
}

/**
 * Daily created/resolved/closed/reopened. Reads the rollup tables when the filters allow
 * it and the ticket table otherwise, so the answer never depends on the sweep having run.
 */
async function trendSeries(
  deps: AnalyticsDeps,
  organizationId: string,
  range: DateRange,
  filters: Filters,
): Promise<TrendPoint[]> {
  const days = eachDay(range);
  const empty = new Map<string, TrendPoint>(
    days.map((day) => [dayKey(day), { day: dayKey(day), created: 0, resolved: 0, closed: 0, reopened: 0 }]),
  );

  if (rollupUsable(filters)) {
    const metrics = await deps.prisma.ticketDailyMetric.findMany({
      where: {
        organizationId,
        day: { gte: range.from, lt: range.to },
        ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      },
      select: { day: true, created: true, resolved: true, closed: true, reopened: true },
    });

    // Rollups only exist for days the sweep has covered; a day with no row is a real
    // zero only if the sweep ran, so fall back when the range is not covered at all.
    if (metrics.length > 0) {
      for (const metric of metrics) {
        const point = empty.get(dayKey(metric.day));
        if (!point) continue;
        point.created += metric.created;
        point.resolved += metric.resolved;
        point.closed += metric.closed;
        point.reopened += metric.reopened;
      }
      const covered = new Set(metrics.map((metric) => dayKey(metric.day)));
      const uncovered = days.filter((day) => !covered.has(dayKey(day)));
      if (uncovered.length === 0) return [...empty.values()];
      // Only the missing days cost a live query.
      await fillLive(deps, organizationId, uncovered, filters, empty);
      return [...empty.values()];
    }
  }

  await fillLive(deps, organizationId, days, filters, empty);
  return [...empty.values()];
}

async function fillLive(
  deps: AnalyticsDeps,
  organizationId: string,
  days: Date[],
  filters: Filters,
  into: Map<string, TrendPoint>,
): Promise<void> {
  if (days.length === 0) return;
  const from = startOfUtcDay(days[0]!);
  const to = addDays(startOfUtcDay(days[days.length - 1]!), 1);
  const where = ticketWhere(organizationId, filters);

  const rows = await deps.prisma.$queryRawUnsafe<
    { day: Date; created: bigint; resolved: bigint; closed: bigint }[]
  >(
    `
    SELECT d.day::date AS day,
      COUNT(t.id) FILTER (WHERE t."createdAt" >= d.day AND t."createdAt" < d.day + INTERVAL '1 day') AS created,
      COUNT(t.id) FILTER (WHERE t."resolvedAt" >= d.day AND t."resolvedAt" < d.day + INTERVAL '1 day') AS resolved,
      COUNT(t.id) FILTER (WHERE t."closedAt" >= d.day AND t."closedAt" < d.day + INTERVAL '1 day') AS closed
    FROM generate_series($1::timestamptz, $2::timestamptz - INTERVAL '1 day', INTERVAL '1 day') AS d(day)
    LEFT JOIN tickets t
      ON t."organizationId" = $3
     AND t."deletedAt" IS NULL
     ${filters.departmentId ? 'AND t."departmentId" = $4' : ''}
     ${filters.agentId ? `AND t."assignedAgentId" = $${filters.departmentId ? 5 : 4}` : ''}
     AND (
       (t."createdAt" >= d.day AND t."createdAt" < d.day + INTERVAL '1 day')
       OR (t."resolvedAt" >= d.day AND t."resolvedAt" < d.day + INTERVAL '1 day')
       OR (t."closedAt" >= d.day AND t."closedAt" < d.day + INTERVAL '1 day')
     )
    GROUP BY d.day
    ORDER BY d.day
  `,
    from,
    to,
    organizationId,
    ...(filters.departmentId ? [filters.departmentId] : []),
    ...(filters.agentId ? [filters.agentId] : []),
  );

  for (const row of rows) {
    const point = into.get(dayKey(new Date(row.day)));
    if (!point) continue;
    point.created = Number(row.created);
    point.resolved = Number(row.resolved);
    point.closed = Number(row.closed);
  }

  // Reopens come from the audit trail, and only for the days being filled.
  const reopens = await deps.prisma.auditLog.findMany({
    where: {
      organizationId,
      entity: 'Ticket',
      action: { in: ['ticket.reopened', 'ticket.customer_replied'] },
      createdAt: { gte: from, lt: to },
    },
    select: { action: true, newValue: true, createdAt: true, entityId: true },
  });

  const scoped = filters.departmentId || filters.agentId ? new Set<string>() : null;
  if (scoped) {
    const tickets = await deps.prisma.ticket.findMany({
      where: { ...where, id: { in: reopens.map((row) => row.entityId) } },
      select: { id: true },
    });
    for (const ticket of tickets) scoped.add(ticket.id);
  }

  for (const row of reopens) {
    if (row.action === 'ticket.customer_replied') {
      const value = row.newValue as { reopened?: boolean } | null;
      if (!value?.reopened) continue;
    }
    if (scoped && !scoped.has(row.entityId)) continue;
    const point = into.get(dayKey(row.createdAt));
    if (point) point.reopened += 1;
  }
}

interface DurationTotals {
  firstResponses: number;
  firstResponseMinutes: number;
  resolutionSamples: number;
  resolutionMinutes: number;
}

async function durationTotals(
  deps: AnalyticsDeps,
  organizationId: string,
  range: DateRange,
  filters: Filters,
): Promise<DurationTotals> {
  const rows = await deps.prisma.$queryRawUnsafe<
    {
      firstResponses: bigint;
      firstResponseMinutes: number | null;
      resolutionSamples: bigint;
      resolutionMinutes: number | null;
    }[]
  >(
    `
    SELECT
      COUNT(*) FILTER (WHERE "firstResponseAt" >= $2 AND "firstResponseAt" < $3) AS "firstResponses",
      COALESCE(SUM(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) / 60)
        FILTER (WHERE "firstResponseAt" >= $2 AND "firstResponseAt" < $3), 0) AS "firstResponseMinutes",
      COUNT(*) FILTER (WHERE "resolvedAt" >= $2 AND "resolvedAt" < $3) AS "resolutionSamples",
      COALESCE(SUM(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 60)
        FILTER (WHERE "resolvedAt" >= $2 AND "resolvedAt" < $3), 0) AS "resolutionMinutes"
    FROM tickets
    WHERE "organizationId" = $1
      AND "deletedAt" IS NULL
      ${filters.departmentId ? 'AND "departmentId" = $4' : ''}
      ${filters.agentId ? `AND "assignedAgentId" = $${filters.departmentId ? 5 : 4}` : ''}
  `,
    organizationId,
    range.from,
    range.to,
    ...(filters.departmentId ? [filters.departmentId] : []),
    ...(filters.agentId ? [filters.agentId] : []),
  );

  const row = rows[0];
  return {
    firstResponses: Number(row?.firstResponses ?? 0),
    firstResponseMinutes: Number(row?.firstResponseMinutes ?? 0),
    resolutionSamples: Number(row?.resolutionSamples ?? 0),
    resolutionMinutes: Number(row?.resolutionMinutes ?? 0),
  };
}

export async function agentReport(
  deps: AnalyticsDeps,
  organizationId: string,
  query: AnalyticsQuery,
  now: Date = new Date(),
): Promise<AgentReport> {
  const range = resolveRange(query, now);
  const inRange = { gte: range.from, lt: range.to };

  const agents = await deps.prisma.user.findMany({
    where: {
      organizationId,
      deletedAt: null,
      type: 'AGENT',
      ...(query.agentId ? { id: query.agentId } : {}),
      ...(query.departmentId ? { departments: { some: { departmentId: query.departmentId } } } : {}),
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  if (agents.length === 0) {
    return { range: { from: iso(range.from), to: iso(range.to) }, rows: [] };
  }

  const agentIds = agents.map((agent) => agent.id);
  const [metrics, openCounts] = await Promise.all([
    deps.prisma.agentDailyMetric.groupBy({
      by: ['agentId'],
      where: { organizationId, agentId: { in: agentIds }, day: inRange },
      _sum: {
        assigned: true,
        resolved: true,
        publicReplies: true,
        firstResponses: true,
        firstResponseMinutes: true,
        resolutionMinutes: true,
        resolutionSamples: true,
        csatResponses: true,
        csatRatingSum: true,
      },
    }),
    deps.prisma.ticket.groupBy({
      by: ['assignedAgentId'],
      where: {
        organizationId,
        deletedAt: null,
        assignedAgentId: { in: agentIds },
        resolvedAt: null,
        closedAt: null,
      },
      _count: { _all: true },
    }),
  ]);

  const rows = agents.map((agent) => {
    const sums = metrics.find((metric) => metric.agentId === agent.id)?._sum;
    const resolutionSamples = sums?.resolutionSamples ?? 0;
    const firstResponses = sums?.firstResponses ?? 0;
    const csatResponses = sums?.csatResponses ?? 0;
    return {
      agentId: agent.id,
      name: `${agent.firstName} ${agent.lastName}`.trim(),
      email: agent.email,
      assigned: sums?.assigned ?? 0,
      resolved: sums?.resolved ?? 0,
      publicReplies: sums?.publicReplies ?? 0,
      firstResponses,
      avgFirstResponseMinutes: average(sums?.firstResponseMinutes ?? 0, firstResponses),
      avgResolutionMinutes: average(sums?.resolutionMinutes ?? 0, resolutionSamples),
      csatResponses,
      csatAverage:
        csatResponses > 0
          ? Math.round(((sums?.csatRatingSum ?? 0) / csatResponses) * 100) / 100
          : null,
      openNow: openCounts.find((row) => row.assignedAgentId === agent.id)?._count._all ?? 0,
    };
  });

  return { range: { from: iso(range.from), to: iso(range.to) }, rows };
}

export async function slaReport(
  deps: AnalyticsDeps,
  organizationId: string,
  query: AnalyticsQuery,
  now: Date = new Date(),
): Promise<SlaReport> {
  const range = resolveRange(query, now);
  const inRange = { gte: range.from, lt: range.to };
  const where = ticketWhere(organizationId, {
    departmentId: query.departmentId,
    agentId: query.agentId,
    priorityId: query.priorityId,
    channelId: query.channelId,
  });

  const [
    firstResponses,
    firstResponseBreached,
    resolutions,
    resolutionBreached,
    firstResponseMet,
    resolutionMet,
    atRisk,
    breachedOpen,
    policies,
  ] = await Promise.all([
    deps.prisma.ticket.count({ where: { ...where, firstResponseAt: inRange } }),
    deps.prisma.ticket.count({ where: { ...where, firstResponseBreachedAt: inRange } }),
    deps.prisma.ticket.count({ where: { ...where, resolvedAt: inRange } }),
    deps.prisma.ticket.count({ where: { ...where, resolutionBreachedAt: inRange } }),
    deps.prisma.ticket.count({
      where: { ...where, firstResponseAt: inRange, firstResponseBreachedAt: null },
    }),
    deps.prisma.ticket.count({
      where: { ...where, resolvedAt: inRange, resolutionBreachedAt: null },
    }),
    deps.prisma.ticket.count({
      where: {
        ...where,
        resolvedAt: null,
        closedAt: null,
        resolutionBreachedAt: null,
        resolutionWarnedAt: { not: null },
      },
    }),
    deps.prisma.ticket.count({
      where: { ...where, resolvedAt: null, closedAt: null, resolutionBreachedAt: { not: null } },
    }),
    deps.prisma.slaPolicy.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
  ]);

  const [byPolicyTickets, byPolicyFirstBreach, byPolicyResBreach, dailyMetrics] = await Promise.all([
    deps.prisma.ticket.groupBy({
      by: ['slaPolicyId'],
      where: { ...where, createdAt: inRange },
      _count: { _all: true },
    }),
    deps.prisma.ticket.groupBy({
      by: ['slaPolicyId'],
      where: { ...where, firstResponseBreachedAt: inRange },
      _count: { _all: true },
    }),
    deps.prisma.ticket.groupBy({
      by: ['slaPolicyId'],
      where: { ...where, resolutionBreachedAt: inRange },
      _count: { _all: true },
    }),
    deps.prisma.ticketDailyMetric.findMany({
      where: {
        organizationId,
        day: inRange,
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      },
      select: {
        day: true,
        slaFirstMet: true,
        slaFirstBreach: true,
        slaResMet: true,
        slaResBreach: true,
      },
      orderBy: { day: 'asc' },
    }),
  ]);

  const trend = eachDay(range).map((day) => {
    const key = dayKey(day);
    const rows = dailyMetrics.filter((metric) => dayKey(metric.day) === key);
    return {
      day: key,
      firstResponseMet: rows.reduce((sum, row) => sum + row.slaFirstMet, 0),
      firstResponseBreached: rows.reduce((sum, row) => sum + row.slaFirstBreach, 0),
      resolutionMet: rows.reduce((sum, row) => sum + row.slaResMet, 0),
      resolutionBreached: rows.reduce((sum, row) => sum + row.slaResBreach, 0),
    };
  });

  return {
    range: { from: iso(range.from), to: iso(range.to) },
    totals: {
      firstResponses,
      firstResponseMet,
      firstResponseBreached,
      firstResponseCompliance: percentage(firstResponseMet, firstResponses),
      resolutions,
      resolutionMet,
      resolutionBreached,
      resolutionCompliance: percentage(resolutionMet, resolutions),
      atRisk,
      breachedOpen,
    },
    trend,
    byPolicy: policies
      .map((policy) => ({
        id: policy.id,
        name: policy.name,
        tickets: byPolicyTickets.find((row) => row.slaPolicyId === policy.id)?._count._all ?? 0,
        firstResponseBreached:
          byPolicyFirstBreach.find((row) => row.slaPolicyId === policy.id)?._count._all ?? 0,
        resolutionBreached:
          byPolicyResBreach.find((row) => row.slaPolicyId === policy.id)?._count._all ?? 0,
      }))
      .filter((row) => row.tickets > 0 || row.firstResponseBreached > 0 || row.resolutionBreached > 0),
  };
}

export async function csatReport(
  deps: AnalyticsDeps,
  organizationId: string,
  query: AnalyticsQuery,
  now: Date = new Date(),
): Promise<CsatReport> {
  const range = resolveRange(query, now);
  const inRange = { gte: range.from, lt: range.to };
  const scope = {
    organizationId,
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.agentId ? { agentId: query.agentId } : {}),
  };

  const [sent, answered, distribution, byAgent, comments, agents] = await Promise.all([
    deps.prisma.csatResponse.count({ where: { ...scope, sentAt: inRange } }),
    deps.prisma.csatResponse.findMany({
      where: { ...scope, status: 'ANSWERED', respondedAt: inRange },
      select: { rating: true, respondedAt: true, agentId: true },
    }),
    deps.prisma.csatResponse.groupBy({
      by: ['rating'],
      where: { ...scope, status: 'ANSWERED', respondedAt: inRange },
      _count: { _all: true },
    }),
    deps.prisma.csatResponse.groupBy({
      by: ['agentId'],
      where: { ...scope, status: 'ANSWERED', respondedAt: inRange, agentId: { not: null } },
      _count: { _all: true },
      _sum: { rating: true },
    }),
    deps.prisma.csatResponse.findMany({
      where: {
        ...scope,
        status: 'ANSWERED',
        respondedAt: inRange,
        comment: { not: null },
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        respondedAt: true,
        ticket: { select: { id: true, ticketNumber: true, subject: true } },
        contact: { select: { firstName: true, lastName: true } },
      },
      orderBy: { respondedAt: 'desc' },
      take: 50,
    }),
    deps.prisma.user.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const ratings = answered.map((row) => row.rating ?? 0).filter((rating) => rating > 0);
  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  const positive = ratings.filter((rating) => rating >= 4).length;
  const neutral = ratings.filter((rating) => rating === 3).length;
  const negative = ratings.filter((rating) => rating <= 2).length;

  return {
    range: { from: iso(range.from), to: iso(range.to) },
    totals: {
      sent,
      responses: ratings.length,
      responseRate: percentage(ratings.length, sent),
      average: ratings.length > 0 ? Math.round((total / ratings.length) * 100) / 100 : null,
      positive,
      neutral,
      negative,
      satisfactionRate: percentage(positive, ratings.length),
    },
    distribution: [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: distribution.find((row) => row.rating === rating)?._count._all ?? 0,
    })),
    trend: eachDay(range).map((day) => {
      const key = dayKey(day);
      const dayRatings = answered
        .filter((row) => row.respondedAt && dayKey(row.respondedAt) === key)
        .map((row) => row.rating ?? 0)
        .filter((rating) => rating > 0);
      const daySum = dayRatings.reduce((sum, rating) => sum + rating, 0);
      return {
        day: key,
        responses: dayRatings.length,
        average: dayRatings.length > 0 ? Math.round((daySum / dayRatings.length) * 100) / 100 : null,
      };
    }),
    byAgent: byAgent
      .filter((row): row is typeof row & { agentId: string } => row.agentId !== null)
      .map((row) => {
        const agent = agents.find((candidate) => candidate.id === row.agentId);
        const count = row._count._all;
        return {
          agentId: row.agentId,
          name: agent ? `${agent.firstName} ${agent.lastName}`.trim() : 'Deleted agent',
          responses: count,
          average: count > 0 ? Math.round(((row._sum.rating ?? 0) / count) * 100) / 100 : null,
        };
      })
      .sort((a, b) => (b.average ?? 0) - (a.average ?? 0)),
    comments: comments.map((row) => ({
      id: row.id,
      rating: row.rating ?? 0,
      comment: row.comment ?? '',
      respondedAt: iso(row.respondedAt ?? range.from),
      ticketId: row.ticket.id,
      ticketNumber: row.ticket.ticketNumber,
      subject: row.ticket.subject,
      contactName: row.contact ? `${row.contact.firstName} ${row.contact.lastName}`.trim() : null,
    })),
  };
}
