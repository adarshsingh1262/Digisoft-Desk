import { Injectable, Logger } from '@nestjs/common';
import { TenantContext } from '@digisoft/db';
import {
  agentReport,
  csatReport,
  dashboard,
  ensureRecentRollup,
  resolveRange,
  slaReport,
  ticketReport,
  type AnalyticsDeps,
} from '@digisoft/analytics';
import type { AnalyticsQuery, ReportKind } from '@digisoft/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The API's handle on the reporting package. The queries live in `@digisoft/analytics`
 * so the worker can run the same ones when it renders an export; this class only adds
 * the tenant boundary.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  readonly deps: AnalyticsDeps;

  constructor(prisma: PrismaService) {
    // Unscoped on purpose: every call names the organization explicitly, and the
    // package's raw SQL filters on it rather than relying on the client extension.
    this.deps = {
      prisma,
      log: (level, message, meta) =>
        level === 'error' ? this.logger.error(message, meta) : this.logger.warn(message),
    };
  }

  dashboard(organizationId: string, query: AnalyticsQuery) {
    return TenantContext.runUnscoped(async () => {
      await this.freshen(organizationId, query);
      return dashboard(this.deps, organizationId, query);
    });
  }

  report(organizationId: string, kind: ReportKind, query: AnalyticsQuery) {
    return TenantContext.runUnscoped(async () => {
      await this.freshen(organizationId, query);
      switch (kind) {
        case 'AGENTS':
          return agentReport(this.deps, organizationId, query);
        case 'SLA':
          return slaReport(this.deps, organizationId, query);
        case 'CSAT':
          return csatReport(this.deps, organizationId, query);
        case 'TICKETS':
        default:
          return ticketReport(this.deps, organizationId, query);
      }
    });
  }

  /**
   * Rolls up today and yesterday if the sweep has not done so recently, so a report
   * never shows a stale picture just because the worker's timer has not fired.
   */
  private async freshen(organizationId: string, query: AnalyticsQuery): Promise<void> {
    try {
      await ensureRecentRollup(this.deps, organizationId, resolveRange(query));
    } catch (error) {
      // A failed rollup degrades the numbers; it must not fail the request.
      this.logger.warn(
        `Unable to refresh metrics for ${organizationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
