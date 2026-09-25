import type { AnalyticsQuery } from '@digisoft/shared';
import { agentReport, csatReport, slaReport, ticketReport } from './reports';
import type { AnalyticsDeps } from './types';

export interface Dashboard {
  range: { from: string; to: string };
  tickets: Awaited<ReturnType<typeof ticketReport>>['totals'];
  trend: Awaited<ReturnType<typeof ticketReport>>['trend'];
  byPriority: Awaited<ReturnType<typeof ticketReport>>['byPriority'];
  byStatus: Awaited<ReturnType<typeof ticketReport>>['byStatus'];
  byChannel: Awaited<ReturnType<typeof ticketReport>>['byChannel'];
  sla: Awaited<ReturnType<typeof slaReport>>['totals'];
  csat: Awaited<ReturnType<typeof csatReport>>['totals'];
  topAgents: Awaited<ReturnType<typeof agentReport>>['rows'];
}

/**
 * One call for the landing screen. The four reports are independent, so they run
 * together rather than in sequence.
 */
export async function dashboard(
  deps: AnalyticsDeps,
  organizationId: string,
  query: AnalyticsQuery,
  now: Date = new Date(),
): Promise<Dashboard> {
  const [tickets, sla, csat, agents] = await Promise.all([
    ticketReport(deps, organizationId, query, now),
    slaReport(deps, organizationId, query, now),
    csatReport(deps, organizationId, query, now),
    agentReport(deps, organizationId, query, now),
  ]);

  return {
    range: tickets.range,
    tickets: tickets.totals,
    trend: tickets.trend,
    byPriority: tickets.byPriority,
    byStatus: tickets.byStatus,
    byChannel: tickets.byChannel,
    sla: sla.totals,
    csat: csat.totals,
    topAgents: [...agents.rows]
      .sort((a, b) => b.resolved - a.resolved || b.publicReplies - a.publicReplies)
      .slice(0, 5),
  };
}
