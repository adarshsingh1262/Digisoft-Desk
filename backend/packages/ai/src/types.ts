/** Everything the assistant is asked to do. One task, one prompt, one result shape. */
export const AI_TASKS = ['SUMMARY', 'SENTIMENT', 'INTENT', 'SUGGESTED_REPLY'] as const;
export type AiTask = (typeof AI_TASKS)[number];

export type AiProviderKind = 'ANTHROPIC' | 'HEURISTIC';

/** One message in the conversation the assistant is reasoning about. */
export interface ConversationTurn {
  author: 'CUSTOMER' | 'AGENT' | 'SYSTEM';
  authorName?: string;
  body: string;
  at?: Date;
}

/** A knowledge base article offered to the assistant as grounding. */
export interface GroundingArticle {
  id: string;
  title: string;
  summary?: string | null;
  body: string;
  url?: string;
}

/** The ticket, flattened into the facts every task needs. */
export interface TicketContext {
  ticketNumber: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  channel: string;
  contactName?: string | null;
  organizationName?: string | null;
  categories?: { id: string; name: string }[];
  priorities?: { id: string; name: string }[];
  conversation: ConversationTurn[];
  articles?: GroundingArticle[];
  /** Organization-specific instructions: tone, product names, language. */
  guidance?: string | null;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface SummaryResult {
  text: string;
  /** Short bullets an agent can scan before opening the thread. */
  highlights: string[];
}

export const SENTIMENTS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'FRUSTRATED'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export interface SentimentResult {
  sentiment: Sentiment;
  /** -1 (furious) … 1 (delighted). */
  score: number;
  rationale: string;
}

export interface IntentResult {
  /** Free-text intent, e.g. "Refund request". */
  intent: string;
  categoryId: string | null;
  categoryName: string | null;
  priorityId: string | null;
  priorityName: string | null;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  confidence: number;
}

export interface SuggestedReplyResult {
  text: string;
  /** Articles the draft leaned on, so an agent can check it. */
  citedArticleIds: string[];
  /** True when nothing in the knowledge base matched and the draft is generic. */
  grounded: boolean;
}

export type AiResult = SummaryResult | SentimentResult | IntentResult | SuggestedReplyResult;

export interface AiResponse<T extends AiResult = AiResult> {
  result: T;
  usage: AiUsage;
  model: string;
  provider: AiProviderKind;
}

/**
 * What every assistant implementation provides. Kept narrow on purpose: the product
 * asks for one of four tasks and gets a typed answer, so swapping the provider cannot
 * change what the rest of the product does with the result.
 */
export interface AiProvider {
  readonly kind: AiProviderKind;
  readonly model: string;
  /** True when the provider needs credentials that are not configured. */
  readonly ready: boolean;
  summarise(context: TicketContext): Promise<AiResponse<SummaryResult>>;
  sentiment(context: TicketContext): Promise<AiResponse<SentimentResult>>;
  intent(context: TicketContext): Promise<AiResponse<IntentResult>>;
  suggestReply(context: TicketContext): Promise<AiResponse<SuggestedReplyResult>>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
