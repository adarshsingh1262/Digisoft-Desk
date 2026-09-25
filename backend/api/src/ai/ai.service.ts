import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantContext } from '@digisoft/db';
import {
  AiDisabledError,
  INSIGHT_SELECT,
  buildProvider,
  loadSettings,
  retrieveArticles,
  runInsight,
  startOfMonth,
  type AiDeps,
  type AiTaskType,
  type TicketContext,
} from '@digisoft/ai';
import type { AuthenticatedUser } from '@digisoft/shared';
import type { TenantPrismaClient } from '@digisoft/db';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/config.module';
import { AppError } from '../common/errors/app-error';
import { AiSettingsService } from './ai-settings.service';

/**
 * The API's handle on the assistant. The analysis itself lives in `@digisoft/ai` so the
 * worker can run exactly the same path; this class adds the request-side concerns —
 * who asked, which ticket they may see, and turning a disabled feature into a 400.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  readonly deps: AiDeps;

  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    prisma: PrismaService,
    config: AppConfig,
    private readonly settings: AiSettingsService,
  ) {
    this.deps = {
      // Unscoped on purpose: every call below names the organization explicitly, and
      // the worker runs the same code with no tenant context at all.
      prisma,
      encryptionKey: config.get('CHANNEL_ENCRYPTION_KEY'),
      log: (level, message) => this.logger[level === 'error' ? 'error' : 'warn'](message),
    };
  }

  /** Insights already generated for a ticket: the newest of each type. */
  async forTicket(ticketId: string) {
    const insights = await this.db.aiInsight.findMany({
      where: { ticketId },
      select: INSIGHT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 40,
    });

    const newest = new Map<string, (typeof insights)[number]>();
    for (const insight of insights) {
      if (!newest.has(insight.type)) {
        newest.set(insight.type, insight);
      }
    }
    return [...newest.values()];
  }

  async generate(
    organizationId: string,
    ticketId: string,
    type: AiTaskType,
    options: { actorId?: string | null; refresh?: boolean } = {},
  ) {
    try {
      // The shared path takes an unscoped client, so it runs outside the request's scope.
      return await TenantContext.runUnscoped(() =>
        runInsight(this.deps, organizationId, ticketId, type, options),
      );
    } catch (error) {
      if (error instanceof AiDisabledError) {
        throw AppError.validation(error.message);
      }
      throw error;
    }
  }

  /** Articles that match the ticket, for the agent panel and as reply grounding. */
  async suggestArticles(organizationId: string, ticketId: string, limit = 5) {
    const ticket = await this.db.ticket.findFirst({
      where: { id: ticketId },
      select: { subject: true, description: true },
    });
    if (!ticket) {
      throw AppError.notFound('ticket');
    }
    return TenantContext.runUnscoped(() =>
      retrieveArticles(
        this.deps,
        organizationId,
        `${ticket.subject}\n${ticket.description}`,
        limit,
      ),
    );
  }

  /** What the assistant has cost this calendar month, and what it was spent on. */
  async usage(organizationId: string) {
    const since = startOfMonth();
    const [byType, totals, settings] = await Promise.all([
      this.db.aiInsight.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, costMicros: true },
      }),
      this.db.aiInsight.aggregate({
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, costMicros: true },
      }),
      this.settings.get(organizationId),
    ]);

    const tokens = (totals._sum.inputTokens ?? 0) + (totals._sum.outputTokens ?? 0);
    return {
      month: since.toISOString().slice(0, 7),
      calls: totals._count._all,
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      costMicros: totals._sum.costMicros ?? 0,
      budgetTokens: settings.monthlyTokenBudget,
      budgetUsedRatio: settings.monthlyTokenBudget > 0 ? tokens / settings.monthlyTokenBudget : null,
      byType: byType.map((row) => ({
        type: row.type,
        calls: row._count._all,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        costMicros: row._sum.costMicros ?? 0,
      })),
    };
  }

  /** Configuration check: a real request to the configured provider. */
  async test(actor: AuthenticatedUser) {
    const settings = await TenantContext.runUnscoped(() =>
      loadSettings(this.deps, actor.organizationId),
    );
    if (!settings.isEnabled) {
      throw AppError.validation('Switch the assistant on before testing it');
    }

    const context: TicketContext = {
      ticketNumber: 0,
      subject: 'Assistant connection test',
      description: 'This is a configuration check from the settings screen.',
      status: 'Open',
      priority: 'Medium',
      channel: 'AGENT',
      contactName: actor.firstName,
      conversation: [],
    };

    try {
      const provider = buildProvider(this.deps, settings);
      const response = await provider.sentiment(context);
      await this.settings.recordCheck(actor.organizationId, null);
      return { ok: true, provider: response.provider, model: response.model, usage: response.usage };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The assistant request failed';
      await this.settings.recordCheck(actor.organizationId, message);
      throw AppError.validation(message);
    }
  }
}
