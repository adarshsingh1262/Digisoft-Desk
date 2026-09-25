import type { PrismaClient } from '@digisoft/db';

/**
 * The analytics package takes an unscoped Prisma client and an explicit
 * `organizationId`, exactly like the rule engine and the assistant: the API runs it
 * inside a tenant context and the worker runs it without one. Every query here filters
 * on `organizationId` itself — raw SQL is not rewritten by the tenant extension, so the
 * filter is the isolation.
 */
export interface AnalyticsDeps {
  prisma: PrismaClient;
  log?: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;
}

/** Half-open `[from, to)`, always in UTC. */
export interface DateRange {
  from: Date;
  to: Date;
}

export interface TicketTotals {
  created: number;
  resolved: number;
  closed: number;
  reopened: number;
  firstResponses: number;
  slaFirstMet: number;
  slaFirstBreach: number;
  slaResMet: number;
  slaResBreach: number;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  resolutionSamples: number;
}

export interface AgentTotals {
  agentId: string;
  assigned: number;
  resolved: number;
  publicReplies: number;
  firstResponses: number;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  resolutionSamples: number;
  csatResponses: number;
  csatRatingSum: number;
}
