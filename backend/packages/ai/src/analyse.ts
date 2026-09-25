import { decryptSecrets, readEncryptionKey } from '@digisoft/channels';
import type { Prisma } from '@digisoft/db';
import type { AiDeps } from './deps';
import { createProvider } from './factory';
import { estimateCostMicros } from './providers/anthropic';
import {
  AiError,
  type AiProvider,
  type GroundingArticle,
  type TicketContext,
} from './types';

export type AiTaskType = 'SUMMARY' | 'SENTIMENT' | 'INTENT' | 'SUGGESTED_REPLY';

export const INSIGHT_SELECT = {
  id: true,
  type: true,
  status: true,
  content: true,
  provider: true,
  model: true,
  inputTokens: true,
  outputTokens: true,
  costMicros: true,
  latencyMs: true,
  error: true,
  createdAt: true,
  requestedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** Words too common to tell one ticket from another when retrieving articles. */
const STOP_WORDS = new Set([
  'the','and','for','with','from','that','this','have','has','not','but','you','your','our','are','was','were','can','cannot','will','would','should','about','when','what','why','how','into','been','they','them','there','here','please','thanks','hello','issue','problem','help',
]);

export class AiDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiDisabledError';
  }
}

/** Reads the organization's settings, creating the row the first time it is needed. */
export async function loadSettings(deps: AiDeps, organizationId: string) {
  const existing = await deps.prisma.aiSettings.findUnique({ where: { organizationId } });
  if (existing) return existing;
  try {
    return await deps.prisma.aiSettings.create({ data: { organizationId } });
  } catch {
    // A concurrent first request created the row; read what it wrote.
    return deps.prisma.aiSettings.findUniqueOrThrow({ where: { organizationId } });
  }
}

export type AiSettingsRow = Awaited<ReturnType<typeof loadSettings>>;

/** Builds the configured assistant, or says precisely why it cannot be built. */
export function buildProvider(deps: AiDeps, settings: AiSettingsRow): AiProvider {
  const apiKey =
    settings.provider === 'ANTHROPIC' && settings.secrets
      ? (decryptSecrets(settings.secrets, readEncryptionKey(deps.encryptionKey))['apiKey'] ?? null)
      : null;

  return createProvider({ kind: settings.provider, model: settings.model, apiKey });
}

export function featureEnabled(settings: AiSettingsRow, type: AiTaskType): boolean {
  switch (type) {
    case 'SUMMARY':
      return settings.summaryEnabled;
    case 'SENTIMENT':
      return settings.sentimentEnabled;
    case 'INTENT':
      return settings.intentEnabled;
    case 'SUGGESTED_REPLY':
      return settings.suggestedReplyEnabled;
  }
}

export function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** A budget is a hard stop, not a warning: past it the assistant does not run. */
export async function assertWithinBudget(
  deps: AiDeps,
  organizationId: string,
  budget: number,
): Promise<void> {
  if (budget <= 0) {
    return;
  }
  const used = await deps.prisma.aiInsight.aggregate({
    where: { organizationId, createdAt: { gte: startOfMonth() } },
    _sum: { inputTokens: true, outputTokens: true },
  });
  const tokens = (used._sum.inputTokens ?? 0) + (used._sum.outputTokens ?? 0);
  if (tokens >= budget) {
    throw new AiDisabledError(
      `This month's AI budget of ${budget.toLocaleString()} tokens is spent. Raise it in settings to continue.`,
    );
  }
}

/**
 * Keyword retrieval over published articles: candidates come back on the ticket's
 * distinctive words, then are scored by where those words appear — title above summary
 * above body. Small, explainable, and enough to ground a draft; an embedding index is
 * the upgrade when a knowledge base outgrows it.
 */
export async function retrieveArticles(
  deps: AiDeps,
  organizationId: string,
  text: string,
  limit: number,
) {
  const terms = keywords(text, 8);
  if (terms.length === 0) {
    return [];
  }

  const candidates = await deps.prisma.kbArticle.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: 'PUBLISHED',
      OR: terms.flatMap((term) => [
        { title: { contains: term, mode: 'insensitive' as const } },
        { summary: { contains: term, mode: 'insensitive' as const } },
        { body: { contains: term, mode: 'insensitive' as const } },
        { keywords: { has: term } },
      ]),
    },
    select: { id: true, title: true, slug: true, summary: true, body: true, viewCount: true },
    take: 40,
  });

  return candidates
    .map((article) => {
      const title = article.title.toLowerCase();
      const summary = (article.summary ?? '').toLowerCase();
      const body = article.body.toLowerCase();
      const score = terms.reduce(
        (total, term) =>
          total +
          (title.includes(term) ? 3 : 0) +
          (summary.includes(term) ? 2 : 0) +
          (body.includes(term) ? 1 : 0),
        0,
      );
      return { ...article, score };
    })
    .filter((article) => article.score > 0)
    .sort((a, b) => b.score - a.score || b.viewCount - a.viewCount)
    .slice(0, limit);
}

/** Assembles everything the assistant is allowed to see about one ticket. */
export async function buildTicketContext(
  deps: AiDeps,
  organizationId: string,
  ticketId: string,
  options: { withArticles: boolean; settings: AiSettingsRow },
): Promise<TicketContext> {
  const ticket = await deps.prisma.ticket.findFirst({
    where: { id: ticketId, organizationId },
    select: {
      ticketNumber: true,
      subject: true,
      description: true,
      source: true,
      status: { select: { name: true } },
      priority: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      organization: { select: { name: true } },
    },
  });
  if (!ticket) {
    throw new AiError('That ticket no longer exists');
  }

  const [messages, categories, priorities] = await Promise.all([
    deps.prisma.ticketMessage.findMany({
      // Internal comments are not what the customer said, and a draft reply must never
      // quote one back to them.
      where: { organizationId, ticketId, type: 'PUBLIC_REPLY', deletedAt: null },
      select: {
        bodyText: true,
        direction: true,
        createdAt: true,
        authorUser: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 40,
    }),
    deps.prisma.ticketCategory.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
    }),
    deps.prisma.ticketPriority.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
  ]);

  const articles = options.withArticles
    ? await retrieveArticles(deps, organizationId, `${ticket.subject}\n${ticket.description}`, 4)
    : [];

  return {
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status.name,
    priority: ticket.priority.name,
    channel: ticket.source,
    contactName: ticket.contact
      ? `${ticket.contact.firstName} ${ticket.contact.lastName ?? ''}`.trim()
      : null,
    organizationName: ticket.organization.name,
    categories,
    priorities,
    conversation: messages.map((message) => ({
      author: message.direction === 'INBOUND' ? ('CUSTOMER' as const) : ('AGENT' as const),
      authorName: message.authorUser
        ? `${message.authorUser.firstName} ${message.authorUser.lastName}`.trim()
        : undefined,
      body: message.bodyText,
      at: message.createdAt,
    })),
    articles: articles.map(
      (article): GroundingArticle => ({
        id: article.id,
        title: article.title,
        summary: article.summary,
        body: article.body,
      }),
    ),
    guidance: settingsGuidance(options.settings),
  };
}

/**
 * Runs one task and stores the result. A failure is stored too: an agent should see that
 * the assistant failed and why, rather than an empty panel that looks like silence.
 */
export async function runInsight(
  deps: AiDeps,
  organizationId: string,
  ticketId: string,
  type: AiTaskType,
  options: { actorId?: string | null; refresh?: boolean } = {},
) {
  const settings = await loadSettings(deps, organizationId);
  if (!settings.isEnabled) {
    throw new AiDisabledError('The assistant is switched off for this organization');
  }
  if (!featureEnabled(settings, type)) {
    throw new AiDisabledError(`${type.toLowerCase().replace(/_/g, ' ')} is switched off`);
  }
  await assertWithinBudget(deps, organizationId, settings.monthlyTokenBudget);

  if (!options.refresh) {
    const recent = await deps.prisma.aiInsight.findFirst({
      where: { organizationId, ticketId, type, status: 'READY' },
      select: INSIGHT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    // An insight is stale the moment someone adds to the conversation.
    if (recent) {
      const newer = await deps.prisma.ticketMessage.count({
        where: { organizationId, ticketId, createdAt: { gt: recent.createdAt } },
      });
      if (newer === 0) {
        return recent;
      }
    }
  }

  const provider = buildProvider(deps, settings);
  const context = await buildTicketContext(deps, organizationId, ticketId, {
    withArticles: type === 'SUGGESTED_REPLY',
    settings,
  });
  const startedAt = Date.now();

  try {
    const response = await run(provider, type, context);
    return await deps.prisma.aiInsight.create({
      data: {
        organizationId,
        ticketId,
        type,
        status: 'READY',
        content: response.result as unknown as Prisma.InputJsonValue,
        provider: response.provider,
        model: response.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costMicros: estimateCostMicros(response.model, response.usage),
        latencyMs: Date.now() - startedAt,
        requestedById: options.actorId ?? null,
      },
      select: INSIGHT_SELECT,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The assistant request failed';
    deps.log?.('warn', `AI ${type} failed for ticket ${ticketId}: ${message}`, { organizationId });

    await deps.prisma.aiSettings.update({
      where: { organizationId },
      data: { lastCheckedAt: new Date(), lastError: message.slice(0, 500) },
    });

    return deps.prisma.aiInsight.create({
      data: {
        organizationId,
        ticketId,
        type,
        status: 'FAILED',
        content: {},
        provider: settings.provider,
        model: settings.model,
        latencyMs: Date.now() - startedAt,
        error: message.slice(0, 500),
        requestedById: options.actorId ?? null,
      },
      select: INSIGHT_SELECT,
    });
  }
}

function run(provider: AiProvider, type: AiTaskType, context: TicketContext) {
  switch (type) {
    case 'SUMMARY':
      return provider.summarise(context);
    case 'SENTIMENT':
      return provider.sentiment(context);
    case 'INTENT':
      return provider.intent(context);
    case 'SUGGESTED_REPLY':
      return provider.suggestReply(context);
  }
}

function settingsGuidance(settings: AiSettingsRow): string | null {
  return settings.promptGuidance ?? null;
}

function keywords(text: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []) {
    if (STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}
