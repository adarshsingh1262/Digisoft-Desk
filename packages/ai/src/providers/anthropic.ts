import Anthropic from '@anthropic-ai/sdk';
import {
  AiError,
  SENTIMENTS,
  type AiResult,
  type AiProvider,
  type AiResponse,
  type IntentResult,
  type SentimentResult,
  type SuggestedReplyResult,
  type SummaryResult,
  type TicketContext,
} from '../types';
import {
  SYSTEM_PROMPT,
  intentPrompt,
  sentimentPrompt,
  suggestedReplyPrompt,
  summaryPrompt,
} from '../prompts';
import { asEnum, asNumber, asString, asStringArray, parseJsonObject } from '../parse';

/** Published per-million-token prices, used to attribute spend to each insight. */
export const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-fable-5-1': { input: 10, output: 50 },
};

export const ANTHROPIC_MODELS = Object.keys(ANTHROPIC_PRICING);
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';

/** Classification answers are short; a draft reply needs room. */
const MAX_TOKENS: Record<string, number> = {
  summary: 1200,
  sentiment: 500,
  intent: 500,
  reply: 2000,
};

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  /** Injectable so tests can exercise the mapping without a network call. */
  client?: Pick<Anthropic, 'messages'>;
}

/**
 * Claude, through the official Anthropic SDK.
 *
 * Every task is one request: a stable system prompt, one user message, JSON back. The
 * ticket text is deliberately the *last* thing in the prompt so the cached prefix stays
 * identical across tickets, and the answer is parsed tolerantly — a malformed response
 * is an error the caller can retry, never a silently wrong insight.
 */
export class AnthropicProvider implements AiProvider {
  readonly kind = 'ANTHROPIC' as const;
  readonly model: string;
  private readonly client: Pick<Anthropic, 'messages'>;

  constructor(options: AnthropicOptions) {
    this.model = options.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey });
  }

  get ready(): boolean {
    return true;
  }

  async summarise(context: TicketContext): Promise<AiResponse<SummaryResult>> {
    const { data, usage } = await this.ask(summaryPrompt(context), MAX_TOKENS['summary'] ?? 1200);
    const highlights = asStringArray(data['highlights'], 6);
    return this.wrap(
      {
        text: asString(data['text'], 'No summary was produced.'),
        highlights,
      },
      usage,
    );
  }

  async sentiment(context: TicketContext): Promise<AiResponse<SentimentResult>> {
    const { data, usage } = await this.ask(sentimentPrompt(context), MAX_TOKENS['sentiment'] ?? 500);
    return this.wrap(
      {
        sentiment: asEnum(data['sentiment'], SENTIMENTS, 'NEUTRAL'),
        score: asNumber(data['score'], 0, -1, 1),
        rationale: asString(data['rationale']),
      },
      usage,
    );
  }

  async intent(context: TicketContext): Promise<AiResponse<IntentResult>> {
    const { data, usage } = await this.ask(intentPrompt(context), MAX_TOKENS['intent'] ?? 500);
    const categoryId = asString(data['categoryId']) || null;
    // A hallucinated id must never reach the database: only ids we offered are kept.
    const category = (context.categories ?? []).find((entry) => entry.id === categoryId) ?? null;
    const urgency = asEnum(data['urgency'], ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const, 'MEDIUM');
    const priority = matchPriority(context, urgency);

    return this.wrap(
      {
        intent: asString(data['intent'], 'General request'),
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        priorityId: priority?.id ?? null,
        priorityName: priority?.name ?? null,
        urgency,
        confidence: asNumber(data['confidence'], 0.5, 0, 1),
      },
      usage,
    );
  }

  async suggestReply(context: TicketContext): Promise<AiResponse<SuggestedReplyResult>> {
    const { data, usage } = await this.ask(suggestedReplyPrompt(context), MAX_TOKENS['reply'] ?? 2000);
    const offered = new Set((context.articles ?? []).map((article) => article.id));
    const cited = asStringArray(data['citedArticleIds']).filter((id) => offered.has(id));

    return this.wrap(
      {
        text: asString(data['text'], ''),
        citedArticleIds: cited,
        grounded: cited.length > 0 && data['grounded'] !== false,
      },
      usage,
    );
  }

  private async ask(prompt: string, maxTokens: number) {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: [
          // The system prompt is identical on every call, so it caches across tickets.
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: prompt }],
      });

      if (response.stop_reason === 'refusal') {
        throw new AiError('The assistant declined to answer this request');
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      return {
        data: parseJsonObject(text),
        usage: {
          inputTokens:
            response.usage.input_tokens +
            (response.usage.cache_read_input_tokens ?? 0) +
            (response.usage.cache_creation_input_tokens ?? 0),
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      if (error instanceof AiError) {
        throw error;
      }
      if (error instanceof Anthropic.APIError) {
        throw new AiError(`Claude refused the request: ${error.message}`, error.status);
      }
      throw new AiError(error instanceof Error ? error.message : 'The assistant request failed');
    }
  }

  private wrap<T extends AiResult>(
    result: T,
    usage: { inputTokens: number; outputTokens: number },
  ): AiResponse<T> {
    return { result, usage, model: this.model, provider: this.kind };
  }
}

/** Maps an urgency judgement onto one of the organization's own priority rows. */
export function matchPriority(
  context: TicketContext,
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
): { id: string; name: string } | null {
  const priorities = context.priorities ?? [];
  const wanted = urgency.toLowerCase();
  return (
    priorities.find((priority) => priority.name.toLowerCase() === wanted) ??
    priorities.find((priority) => priority.name.toLowerCase().includes(wanted)) ??
    null
  );
}

/** Cost of one call, in ten-thousandths of a cent, from the published price list. */
export function estimateCostMicros(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const pricing = ANTHROPIC_PRICING[model];
  if (!pricing) {
    return 0;
  }
  const dollars =
    (usage.inputTokens / 1_000_000) * pricing.input +
    (usage.outputTokens / 1_000_000) * pricing.output;
  return Math.round(dollars * 100 * 10_000);
}
