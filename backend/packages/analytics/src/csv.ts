import type { AnalyticsQuery, ReportKind } from '@digisoft/shared';
import { agentReport, csatReport, slaReport, ticketReport } from './reports';
import type { AnalyticsDeps } from './types';

type Cell = string | number | boolean | null | undefined;

/**
 * RFC 4180 quoting. A comment containing a comma, a quote or a newline is the normal
 * case in CSAT data, not an edge case, so every field is escaped rather than inspected.
 */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const escape = (cell: Cell): string => {
    if (cell === null || cell === undefined) return '';
    const text = String(cell);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
}

const minutes = (value: number | null) => (value === null ? '' : value);

/** Builds the CSV for one report kind. The columns match what the screen shows. */
export async function renderReportCsv(
  deps: AnalyticsDeps,
  organizationId: string,
  kind: ReportKind,
  query: AnalyticsQuery,
  now: Date = new Date(),
): Promise<{ csv: string; rowCount: number }> {
  switch (kind) {
    case 'AGENTS': {
      const report = await agentReport(deps, organizationId, query, now);
      return {
        csv: toCsv(
          [
            'Agent',
            'Email',
            'Assigned',
            'Resolved',
            'Public replies',
            'First responses',
            'Avg first response (min)',
            'Avg resolution (min)',
            'CSAT responses',
            'CSAT average',
            'Open now',
          ],
          report.rows.map((row) => [
            row.name,
            row.email,
            row.assigned,
            row.resolved,
            row.publicReplies,
            row.firstResponses,
            minutes(row.avgFirstResponseMinutes),
            minutes(row.avgResolutionMinutes),
            row.csatResponses,
            row.csatAverage ?? '',
            row.openNow,
          ]),
        ),
        rowCount: report.rows.length,
      };
    }
    case 'SLA': {
      const report = await slaReport(deps, organizationId, query, now);
      return {
        csv: toCsv(
          [
            'Day',
            'First response met',
            'First response breached',
            'Resolution met',
            'Resolution breached',
          ],
          report.trend.map((row) => [
            row.day,
            row.firstResponseMet,
            row.firstResponseBreached,
            row.resolutionMet,
            row.resolutionBreached,
          ]),
        ),
        rowCount: report.trend.length,
      };
    }
    case 'CSAT': {
      const report = await csatReport(deps, organizationId, query, now);
      return {
        csv: toCsv(
          ['Responded at', 'Ticket', 'Subject', 'Customer', 'Rating', 'Comment'],
          report.comments.map((row) => [
            row.respondedAt,
            `#${row.ticketNumber}`,
            row.subject,
            row.contactName ?? '',
            row.rating,
            row.comment,
          ]),
        ),
        rowCount: report.comments.length,
      };
    }
    case 'TICKETS':
    default: {
      const report = await ticketReport(deps, organizationId, query, now);
      return {
        csv: toCsv(
          ['Day', 'Created', 'Resolved', 'Closed', 'Reopened'],
          report.trend.map((row) => [row.day, row.created, row.resolved, row.closed, row.reopened]),
        ),
        rowCount: report.trend.length,
      };
    }
  }
}
