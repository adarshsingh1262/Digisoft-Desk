import type {
  AiProvider,
  AiResponse,
  AiResult,
  IntentResult,
  SentimentResult,
  SuggestedReplyResult,
  SummaryResult,
  TicketContext,
} from '../types';
import { matchPriority } from './anthropic';

/**
 * Deterministic analysis that runs in-process: no credentials, no network, no cost.
 *
 * It is not a stand-in for a model and does not pretend to be one — it is lexicon and
 * rule based, and the UI says so. It exists because an organization should get sentiment
 * flags, a readable digest and article suggestions on day one, and because every AI
 * feature then has a working path that can be tested without a provider account.
 */

const NEGATIVE_TERMS: Record<string, number> = {
  angry: 2, furious: 3, unacceptable: 3, ridiculous: 2, appalling: 3, awful: 2,
  terrible: 2, useless: 2, broken: 1, crash: 1, crashes: 1, error: 1, errors: 1,
  failed: 1, failing: 1, fails: 1, bug: 1, wrong: 1, slow: 1, late: 1, worse: 2,
  disappointed: 2, frustrated: 3, frustrating: 3, annoyed: 2, upset: 2, refund: 1,
  cancel: 2, cancelling: 2, complaint: 2, escalate: 2, lawyer: 3, legal: 2,
  'still not': 2, 'third time': 3, 'no response': 2, 'not working': 2, urgent: 1,
};

const POSITIVE_TERMS: Record<string, number> = {
  thanks: 2, thank: 2, 'thank you': 3, great: 2, excellent: 3, perfect: 3, brilliant: 3,
  helpful: 2, appreciate: 2, appreciated: 2, resolved: 2, works: 1, working: 1,
  fantastic: 3, love: 2, pleased: 2, happy: 2, 'sorted': 1,
};

interface IntentRule {
  intent: string;
  urgency: IntentResult['urgency'];
  terms: string[];
  /// Words to look for in the organization's own category names.
  categoryHints: string[];
}

const INTENT_RULES: IntentRule[] = [
  { intent: 'Outage or service down', urgency: 'URGENT', categoryHints: ['technical', 'incident', 'outage', 'product'], terms: ['outage', 'down', 'cannot access', "can't access", 'offline', 'nothing loads', '500 error'] },
  { intent: 'Login or access problem', urgency: 'HIGH', categoryHints: ['technical', 'account', 'access', 'product'], terms: ['login', 'log in', 'sign in', 'password', 'locked out', 'two factor', 'mfa', 'access denied'] },
  { intent: 'Billing or invoice question', urgency: 'MEDIUM', categoryHints: ['billing', 'payment', 'finance', 'invoice'], terms: ['invoice', 'billing', 'charge', 'charged', 'payment', 'receipt', 'vat', 'subscription', 'plan'] },
  { intent: 'Refund or cancellation', urgency: 'HIGH', categoryHints: ['billing', 'payment', 'finance'], terms: ['refund', 'money back', 'cancel my', 'cancellation', 'chargeback'] },
  { intent: 'Bug report', urgency: 'HIGH', categoryHints: ['technical', 'bug', 'product', 'fault'], terms: ['bug', 'error', 'crash', 'broken', 'not working', 'exception', 'stack trace'] },
  { intent: 'Feature request', urgency: 'LOW', categoryHints: ['feature', 'request', 'product', 'idea'], terms: ['feature request', 'would be great if', 'please add', 'suggestion', 'roadmap', 'any plans'] },
  { intent: 'How-to question', urgency: 'LOW', categoryHints: ['general', 'how', 'support'], terms: ['how do i', 'how can i', 'is it possible', 'where do i', 'what is the'] },
  { intent: 'Delivery or order status', urgency: 'MEDIUM', categoryHints: ['order', 'delivery', 'shipping', 'general'], terms: ['order', 'shipping', 'delivery', 'tracking', 'dispatch', 'arrived'] },
];

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','if','then','so','of','to','in','on','for','with','at','by','from','up','about','into','over','after','is','are','was','were','be','been','being','do','does','did','have','has','had','i','we','you','they','it','this','that','my','our','your','their','me','us','them','not','no','yes','can','cannot','could','would','should','will','just','please','hi','hello','thanks','thank','regards','dear',
]);

function countTerms(text: string, table: Record<string, number>): number {
  const haystack = ` ${text.toLowerCase()} `;
  let score = 0;
  for (const [term, weight] of Object.entries(table)) {
    const needle = term.includes(' ') ? term : ` ${term} `;
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      // "not great" flips a positive term; the two words before the hit decide it.
      const before = haystack.slice(Math.max(0, index - 14), index);
      const negated = /\b(not|never|hardly|no)\s*$/.test(before);
      score += negated ? -weight : weight;
      index = haystack.indexOf(needle, index + needle.length);
    }
  }
  return score;
}

function customerText(context: TicketContext): string {
  const turns = context.conversation.filter((turn) => turn.author === 'CUSTOMER');
  return [context.subject, context.description, ...turns.map((turn) => turn.body)].join('\n');
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);
}

function keywords(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
    if (STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

export class HeuristicProvider implements AiProvider {
  readonly kind = 'HEURISTIC' as const;
  readonly model = 'rule-based';
  readonly ready = true;

  summarise(context: TicketContext): Promise<AiResponse<SummaryResult>> {
    const customerTurns = context.conversation.filter((turn) => turn.author === 'CUSTOMER');
    const agentTurns = context.conversation.filter((turn) => turn.author === 'AGENT');
    const ask = sentences(context.description)[0] ?? context.description.slice(0, 200);
    const latest = customerTurns[customerTurns.length - 1]?.body;

    const text = [
      `${context.contactName ?? 'The customer'} opened #${context.ticketNumber} on ${context.channel.toLowerCase()} about "${context.subject}".`,
      ask ? `They wrote: ${ask.slice(0, 220)}` : '',
      agentTurns.length > 0
        ? `The team has replied ${agentTurns.length} time(s); the last reply was "${(agentTurns[agentTurns.length - 1]?.body ?? '').slice(0, 120)}".`
        : 'Nobody has replied yet.',
      latest && latest !== ask ? `Latest from the customer: ${latest.slice(0, 180)}` : '',
      `It is ${context.status} at ${context.priority} priority.`,
    ]
      .filter(Boolean)
      .join(' ');

    const highlights = [
      `Channel: ${context.channel}`,
      `Replies from the team: ${agentTurns.length}`,
      `Messages from the customer: ${customerTurns.length + 1}`,
      `Topics: ${keywords(customerText(context), 5).join(', ') || '—'}`,
    ];

    return Promise.resolve(this.wrap({ text, highlights }, text));
  }

  sentiment(context: TicketContext): Promise<AiResponse<SentimentResult>> {
    const text = customerText(context);
    const negative = countTerms(text, NEGATIVE_TERMS);
    const positive = countTerms(text, POSITIVE_TERMS);
    const shouting = (text.match(/\b[A-Z]{4,}\b/g) ?? []).length;
    const exclamations = (text.match(/!/g) ?? []).length;
    const raw = positive - negative - shouting - Math.min(exclamations, 5) * 0.5;
    const score = Math.max(-1, Math.min(1, raw / 6));

    const sentiment: SentimentResult['sentiment'] =
      score <= -0.6 ? 'FRUSTRATED' : score < -0.15 ? 'NEGATIVE' : score > 0.25 ? 'POSITIVE' : 'NEUTRAL';

    const rationale =
      negative > positive
        ? `Negative wording outweighs positive (${negative} vs ${positive})${shouting > 0 ? `, with ${shouting} shouted word(s)` : ''}.`
        : positive > negative
          ? `Positive wording outweighs negative (${positive} vs ${negative}).`
          : 'The wording is even-handed.';

    return Promise.resolve(this.wrap({ sentiment, score: Number(score.toFixed(2)), rationale }, text));
  }

  intent(context: TicketContext): Promise<AiResponse<IntentResult>> {
    const text = ` ${customerText(context).toLowerCase()} `;
    let best: { rule: IntentRule; hits: number } | null = null;

    for (const rule of INTENT_RULES) {
      const hits = rule.terms.filter((term) => text.includes(term)).length;
      if (hits > 0 && (!best || hits > best.hits)) {
        best = { rule, hits };
      }
    }

    const intent = best?.rule.intent ?? 'General request';
    const urgency = best?.rule.urgency ?? 'MEDIUM';
    const category = matchCategory(context, best?.rule.categoryHints ?? ['general']);
    const priority = matchPriority(context, urgency);

    return Promise.resolve(
      this.wrap(
        {
          intent,
          categoryId: category?.id ?? null,
          categoryName: category?.name ?? null,
          priorityId: priority?.id ?? null,
          priorityName: priority?.name ?? null,
          urgency,
          // Rule matches are evidence, not certainty: the ceiling stays deliberately low.
          confidence: best ? Math.min(0.8, 0.4 + best.hits * 0.15) : 0.3,
        },
        text,
      ),
    );
  }

  suggestReply(context: TicketContext): Promise<AiResponse<SuggestedReplyResult>> {
    const articles = context.articles ?? [];
    const name = context.contactName?.split(' ')[0] ?? 'there';
    const top = articles.slice(0, 2);

    const body =
      top.length > 0
        ? [
            `Hi ${name},`,
            '',
            `Thanks for getting in touch about "${context.subject}".`,
            '',
            'This looks like something our guide covers:',
            ...top.map((article) => `• ${article.title}${article.url ? ` — ${article.url}` : ''}${article.summary ? `\n  ${article.summary}` : ''}`),
            '',
            'Could you tell me whether that matches what you are seeing? If it does not, send me a screenshot and I will take it from there.',
          ].join('\n')
        : [
            `Hi ${name},`,
            '',
            `Thanks for getting in touch about "${context.subject}".`,
            '',
            'I am looking into this now. So that I can get to the bottom of it quickly, could you send me:',
            '• when you first noticed it,',
            '• what you were doing at the time,',
            '• and a screenshot of anything you saw on screen.',
            '',
            'I will come back to you as soon as I have an answer.',
          ].join('\n');

    return Promise.resolve(
      this.wrap(
        {
          text: `${body}\n\n— Support`,
          citedArticleIds: top.map((article) => article.id),
          grounded: top.length > 0,
        },
        body,
      ),
    );
  }

  /**
   * There is no model and no bill, but the caller still wants a usage figure; a
   * word-based estimate keeps the accounting shape identical for every provider.
   */
  private wrap<T extends AiResult>(result: T, consideredText: string): AiResponse<T> {
    const words = consideredText.split(/\s+/).filter(Boolean).length;
    return {
      result,
      usage: { inputTokens: Math.ceil(words * 1.3), outputTokens: 0 },
      model: this.model,
      provider: this.kind,
    };
  }
}

/** Picks the organization's own category whose name matches the intent's hints. */
function matchCategory(
  context: TicketContext,
  hints: string[],
): { id: string; name: string } | null {
  const categories = context.categories ?? [];
  for (const hint of hints) {
    const match = categories.find((category) => category.name.toLowerCase().includes(hint));
    if (match) {
      return match;
    }
  }
  return categories.find((category) => category.name.toLowerCase() === 'general') ?? null;
}
