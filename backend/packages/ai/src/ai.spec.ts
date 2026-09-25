import type Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicProvider,
  HeuristicProvider,
  createProvider,
  estimateCostMicros,
  parseJsonObject,
  type TicketContext,
} from './index';

const baseContext: TicketContext = {
  ticketNumber: 42,
  subject: 'Export fails above 500 rows',
  description: 'Every export larger than 500 rows crashes the tab. This is the third time.',
  status: 'Open',
  priority: 'Medium',
  channel: 'EMAIL',
  contactName: 'Rhea Kapoor',
  categories: [
    { id: 'cat-tech', name: 'Technical' },
    { id: 'cat-billing', name: 'Billing' },
    { id: 'cat-general', name: 'General' },
  ],
  priorities: [
    { id: 'p-low', name: 'Low' },
    { id: 'p-med', name: 'Medium' },
    { id: 'p-high', name: 'High' },
    { id: 'p-urgent', name: 'Urgent' },
  ],
  conversation: [
    { author: 'CUSTOMER', body: 'Every export larger than 500 rows crashes the tab.' },
    { author: 'AGENT', authorName: 'Ash', body: 'Thanks — could you try again in a private window?' },
    { author: 'CUSTOMER', body: 'Still not working. This is frustrating.' },
  ],
  articles: [
    {
      id: 'kb-1',
      title: 'Exporting large data sets',
      summary: 'Use the background exporter above 500 rows.',
      body: 'Above 500 rows the legacy exporter runs in the browser and can run out of memory.',
    },
  ],
};

describe('tolerant JSON parsing', () => {
  it('reads plain JSON, fenced JSON and JSON with prose around it', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonObject('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJsonObject('Here you go:\n{"a":3}\nHope that helps')).toEqual({ a: 3 });
  });

  it('refuses anything that is not an object', () => {
    expect(() => parseJsonObject('not json at all')).toThrow();
    expect(() => parseJsonObject('[1,2,3]')).toThrow();
  });
});

describe('heuristic provider', () => {
  const provider = new HeuristicProvider();

  it('reads frustration from the customer wording', async () => {
    const { result } = await provider.sentiment(baseContext);
    expect(['NEGATIVE', 'FRUSTRATED']).toContain(result.sentiment);
    expect(result.score).toBeLessThan(0);
    expect(result.rationale).not.toHaveLength(0);
  });

  it('reads gratitude as positive', async () => {
    const { result } = await provider.sentiment({
      ...baseContext,
      description: 'Thank you, that worked perfectly. Brilliant support.',
      conversation: [{ author: 'CUSTOMER', body: 'Thanks again, excellent help.' }],
    });
    expect(result.sentiment).toBe('POSITIVE');
    expect(result.score).toBeGreaterThan(0);
  });

  it('does not read "not great" as praise', async () => {
    const { result } = await provider.sentiment({
      ...baseContext,
      description: 'This is not great and the experience has not been helpful.',
      conversation: [],
    });
    expect(result.score).toBeLessThan(0);
  });

  it('classifies intent and maps it onto the organization own rows', async () => {
    const { result } = await provider.intent(baseContext);
    expect(result.intent).toBe('Bug report');
    expect(result.urgency).toBe('HIGH');
    expect(result.priorityId).toBe('p-high');
    expect(result.categoryId).toBe('cat-tech');
    expect(result.confidence).toBeLessThanOrEqual(0.8);
  });

  it('recognises a billing question', async () => {
    const { result } = await provider.intent({
      ...baseContext,
      subject: 'Invoice question',
      description: 'I was charged twice on my last invoice and need a receipt.',
      conversation: [],
    });
    expect(result.intent).toBe('Billing or invoice question');
    expect(result.categoryId).toBe('cat-billing');
  });

  it('summarises who wants what, and what has happened', async () => {
    const { result, usage } = await provider.summarise(baseContext);
    expect(result.text).toContain('#42');
    expect(result.text).toContain('Rhea Kapoor');
    expect(result.highlights.length).toBeGreaterThan(2);
    expect(usage.inputTokens).toBeGreaterThan(0);
  });

  it('drafts a reply grounded in the matched article', async () => {
    const { result } = await provider.suggestReply(baseContext);
    expect(result.text).toContain('Rhea');
    expect(result.text).toContain('Exporting large data sets');
    expect(result.citedArticleIds).toEqual(['kb-1']);
    expect(result.grounded).toBe(true);
  });

  it('asks for detail instead of inventing an answer when nothing matched', async () => {
    const { result } = await provider.suggestReply({ ...baseContext, articles: [] });
    expect(result.grounded).toBe(false);
    expect(result.citedArticleIds).toEqual([]);
    expect(result.text).toContain('screenshot');
  });
});

/** The Anthropic client is injected, so the mapping is tested without a network call. */
function stubClient(text: string) {
  const create = jest.fn().mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage: { input_tokens: 1200, output_tokens: 180, cache_read_input_tokens: 800 },
  });
  return { client: { messages: { create } } as unknown as Pick<Anthropic, 'messages'>, create };
}

describe('anthropic provider mapping', () => {
  it('keeps only category ids it was offered', async () => {
    const { client } = stubClient(
      '{"intent":"Refund request","categoryId":"cat-made-up","urgency":"URGENT","confidence":0.9}',
    );
    const provider = new AnthropicProvider({ apiKey: 'test', client });
    const { result } = await provider.intent(baseContext);

    expect(result.intent).toBe('Refund request');
    expect(result.categoryId).toBeNull();
    expect(result.priorityId).toBe('p-urgent');
  });

  it('keeps only article ids it was offered, and marks the draft ungrounded otherwise', async () => {
    const { client } = stubClient(
      '{"text":"Here is the fix","citedArticleIds":["kb-1","kb-elsewhere"],"grounded":true}',
    );
    const provider = new AnthropicProvider({ apiKey: 'test', client });
    const { result } = await provider.suggestReply(baseContext);

    expect(result.citedArticleIds).toEqual(['kb-1']);
    expect(result.grounded).toBe(true);
  });

  it('clamps a sentiment score and falls back to NEUTRAL on an unknown label', async () => {
    const { client } = stubClient('{"sentiment":"MILDLY_CROSS","score":-8,"rationale":"x"}');
    const provider = new AnthropicProvider({ apiKey: 'test', client });
    const { result } = await provider.sentiment(baseContext);

    expect(result.sentiment).toBe('NEUTRAL');
    expect(result.score).toBe(-1);
  });

  it('counts cached input tokens in usage and names the model', async () => {
    const { client, create } = stubClient('{"text":"A summary","highlights":["one"]}');
    const provider = new AnthropicProvider({ apiKey: 'test', model: 'claude-sonnet-5', client });
    const { usage, model, provider: kind } = await provider.summarise(baseContext);

    expect(usage.inputTokens).toBe(2000);
    expect(usage.outputTokens).toBe(180);
    expect(model).toBe('claude-sonnet-5');
    expect(kind).toBe('ANTHROPIC');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-5' }));
  });

  it('turns a refusal into an error rather than an empty insight', async () => {
    const create = jest.fn().mockResolvedValue({
      stop_reason: 'refusal',
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });
    const provider = new AnthropicProvider({
      apiKey: 'test',
      client: { messages: { create } } as unknown as Pick<Anthropic, 'messages'>,
    });
    await expect(provider.summarise(baseContext)).rejects.toThrow(/declined/);
  });

  it('errors instead of guessing when the answer is not JSON', async () => {
    const { client } = stubClient('I think the customer is upset.');
    const provider = new AnthropicProvider({ apiKey: 'test', client });
    await expect(provider.sentiment(baseContext)).rejects.toThrow(/usable JSON/);
  });
});

describe('cost estimation', () => {
  it('prices a call from the published rates', () => {
    // 1M input + 1M output on Opus 5 = $5 + $25 = $30 = 3000 cents = 30,000,000 micros.
    expect(estimateCostMicros('claude-opus-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(
      30_000_000,
    );
    expect(estimateCostMicros('rule-based', { inputTokens: 5000, outputTokens: 0 })).toBe(0);
  });
});

describe('provider factory', () => {
  it('refuses to build an Anthropic provider without a key', () => {
    expect(() => createProvider({ kind: 'ANTHROPIC', apiKey: null })).toThrow(/API key/);
  });

  it('always has a working provider available', () => {
    expect(createProvider({ kind: 'HEURISTIC' }).kind).toBe('HEURISTIC');
  });
});
