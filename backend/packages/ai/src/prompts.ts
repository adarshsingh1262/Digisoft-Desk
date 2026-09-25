import type { TicketContext } from './types';

/** Caps the prompt so one enormous thread cannot blow up a request or its cost. */
const MAX_TURNS = 20;
const MAX_TURN_CHARS = 2000;
const MAX_ARTICLE_CHARS = 2500;

export const SYSTEM_PROMPT = `You are the assistant inside a customer support help desk.
You read one support ticket and answer the single question you are asked about it.

Rules you never break:
- Use only what the ticket and the supplied knowledge base articles say. Never invent
  policies, prices, dates, order numbers or promises.
- If the articles do not cover the question, say so rather than guessing.
- Answer with JSON only — no prose around it, no code fences.
- Write in the language the customer used.`;

function trim(value: string, limit: number): string {
  const clean = value.replace(/\s+\n/g, '\n').trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

/** The ticket as prompt text; shared by every task so caching sees one stable prefix. */
export function renderTicket(context: TicketContext): string {
  const lines: string[] = [
    `Ticket #${context.ticketNumber}: ${context.subject}`,
    `Status: ${context.status} · Priority: ${context.priority} · Channel: ${context.channel}`,
  ];
  if (context.contactName) {
    lines.push(`Customer: ${context.contactName}`);
  }
  lines.push('', 'First message:', trim(context.description, MAX_TURN_CHARS));

  const turns = context.conversation.slice(-MAX_TURNS);
  if (turns.length > 0) {
    lines.push('', 'Conversation so far:');
    for (const turn of turns) {
      const who = turn.author === 'AGENT' ? `Agent${turn.authorName ? ` (${turn.authorName})` : ''}` : 'Customer';
      lines.push(`- ${who}: ${trim(turn.body, MAX_TURN_CHARS)}`);
    }
  }
  return lines.join('\n');
}

export function renderArticles(context: TicketContext): string {
  const articles = context.articles ?? [];
  if (articles.length === 0) {
    return 'No knowledge base articles matched this ticket.';
  }
  return articles
    .map(
      (article, index) =>
        `[${index + 1}] id=${article.id} · ${article.title}\n${trim(
          article.summary ? `${article.summary}\n${article.body}` : article.body,
          MAX_ARTICLE_CHARS,
        )}`,
    )
    .join('\n\n');
}

function guidance(context: TicketContext): string {
  return context.guidance ? `\n\nHouse instructions: ${context.guidance.trim()}` : '';
}

export function summaryPrompt(context: TicketContext): string {
  return `${renderTicket(context)}${guidance(context)}

Summarise this ticket for an agent who has never seen it. Say what the customer wants,
what has been tried, and what is outstanding.

Answer with JSON: {"text": "2-4 sentences", "highlights": ["short bullet", ...]}`;
}

export function sentimentPrompt(context: TicketContext): string {
  return `${renderTicket(context)}${guidance(context)}

Judge how the customer feels, from their words only — not from how serious the problem is.

Answer with JSON: {"sentiment": "POSITIVE|NEUTRAL|NEGATIVE|FRUSTRATED", "score": -1..1,
"rationale": "one sentence quoting what decided it"}`;
}

export function intentPrompt(context: TicketContext): string {
  const categories = (context.categories ?? [])
    .map((category) => `${category.id} = ${category.name}`)
    .join('\n');
  return `${renderTicket(context)}${guidance(context)}

Classify what the customer is asking for.

Available categories (use one id exactly, or null if none fit):
${categories || '(none configured)'}

Answer with JSON: {"intent": "short phrase", "categoryId": "id or null",
"urgency": "LOW|MEDIUM|HIGH|URGENT", "confidence": 0..1}`;
}

export function suggestedReplyPrompt(context: TicketContext): string {
  return `${renderTicket(context)}

Knowledge base articles you may use:
${renderArticles(context)}${guidance(context)}

Draft the next reply to the customer, for an agent to review before sending. Address them
by name if you know it, answer from the articles, and be specific about the next step. If
the articles do not answer the question, say what you can and ask for what you need
instead of inventing an answer.

Answer with JSON: {"text": "the reply", "citedArticleIds": ["article id", ...],
"grounded": true|false}`;
}
