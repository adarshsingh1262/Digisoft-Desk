import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';

/**
 * The assistant, end to end. Everything here runs on the built-in provider: no network,
 * no credentials, and the same code path the Anthropic provider takes.
 */
describe('AI assistant (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let auth: { Authorization: string };
  let contactId: string;
  let ticketId: string;

  const enable = (overrides: Record<string, unknown> = {}) =>
    request(http)
      .patch(apiPath('/ai/settings'))
      .set(auth)
      .send({ provider: 'HEURISTIC', isEnabled: true, ...overrides })
      .expect(200);

  const generate = (type: string, refresh = false) =>
    request(http).post(apiPath(`/tickets/${ticketId}/ai`)).set(auth).send({ type, refresh });

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma, harness.redis);
    const org = await registerOrg(http, 'assistant');
    auth = { Authorization: `Bearer ${org.token}` };

    const contact = await request(http)
      .post(apiPath('/contacts'))
      .set(auth)
      .send({ firstName: 'Casey', lastName: 'Customer', email: 'casey@assistant.example' })
      .expect(201);
    contactId = contact.body.data.id;

    const ticket = await request(http)
      .post(apiPath('/tickets'))
      .set(auth)
      .send({
        subject: 'Checkout fails with an error every time I pay',
        description:
          'Since this morning every payment attempt returns an error page. This is broken and it is costing us orders.',
        contactId,
      })
      .expect(201);
    ticketId = ticket.body.data.id;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('starts disabled and refuses to generate anything', async () => {
    const settings = await request(http).get(apiPath('/ai/settings')).set(auth).expect(200);
    expect(settings.body.data.isEnabled).toBe(false);
    expect(settings.body.data.provider).toBe('HEURISTIC');

    const refused = await generate('SUMMARY').expect(400);
    expect(String(refused.body.error.message)).toMatch(/assistant/i);
  });

  it('never returns the stored API key', async () => {
    const updated = await request(http)
      .patch(apiPath('/ai/settings'))
      .set(auth)
      .send({ provider: 'ANTHROPIC', model: 'claude-opus-5', apiKey: 'sk-ant-secret-value' })
      .expect(200);

    expect(updated.body.data.hasApiKey).toBe(true);
    expect(JSON.stringify(updated.body)).not.toContain('sk-ant-secret-value');

    const settings = await request(http).get(apiPath('/ai/settings')).set(auth).expect(200);
    expect(settings.body.data.hasApiKey).toBe(true);
    expect(JSON.stringify(settings.body)).not.toContain('sk-ant-secret-value');
    expect(settings.body.data.apiKey).toBeUndefined();
    expect(settings.body.data.secrets).toBeUndefined();

    // Clearing is explicit: an empty string, never an omitted field.
    const cleared = await request(http)
      .patch(apiPath('/ai/settings'))
      .set(auth)
      .send({ apiKey: '' })
      .expect(200);
    expect(cleared.body.data.hasApiKey).toBe(false);
  });

  it('refuses to enable Anthropic without a key', async () => {
    const response = await request(http)
      .patch(apiPath('/ai/settings'))
      .set(auth)
      .send({ provider: 'ANTHROPIC', isEnabled: true })
      .expect(400);
    expect(String(response.body.error.message)).toMatch(/key/i);
  });

  it('summarises, scores sentiment and classifies intent', async () => {
    await enable();

    const summary = await generate('SUMMARY').expect(200);
    expect(summary.body.data.status).toBe('READY');
    expect(summary.body.data.content.text.length).toBeGreaterThan(0);
    expect(summary.body.data.provider).toBe('HEURISTIC');

    const sentiment = await generate('SENTIMENT').expect(200);
    expect(['NEGATIVE', 'FRUSTRATED']).toContain(sentiment.body.data.content.sentiment);
    expect(sentiment.body.data.content.score).toBeLessThan(0);

    const intent = await generate('INTENT').expect(200);
    expect(intent.body.data.content.intent.length).toBeGreaterThan(0);
    expect(intent.body.data.content.urgency).toBeDefined();

    const listed = await request(http).get(apiPath(`/tickets/${ticketId}/ai`)).set(auth).expect(200);
    expect((listed.body.data as { type: string }[]).map((i) => i.type).sort()).toEqual([
      'INTENT',
      'SENTIMENT',
      'SUMMARY',
    ]);
  });

  it('reuses a current insight unless a refresh is asked for', async () => {
    await enable();
    const first = await generate('SUMMARY').expect(200);
    const second = await generate('SUMMARY').expect(200);
    expect(second.body.data.id).toBe(first.body.data.id);

    const third = await generate('SUMMARY', true).expect(200);
    expect(third.body.data.id).not.toBe(first.body.data.id);
  });

  it('honours the per-feature toggles', async () => {
    await enable({ suggestedReplyEnabled: false });
    const refused = await generate('SUGGESTED_REPLY').expect(400);
    expect(String(refused.body.error.message)).toMatch(/switched off/i);

    await enable({ suggestedReplyEnabled: true });
    const reply = await generate('SUGGESTED_REPLY').expect(200);
    expect(reply.body.data.content.text.length).toBeGreaterThan(0);
  });

  it('grounds a suggested reply in published knowledge base articles', async () => {
    await enable();
    const category = await request(http)
      .post(apiPath('/kb/categories'))
      .set(auth)
      .send({ name: 'Billing' })
      .expect(201);

    await request(http)
      .post(apiPath('/kb/articles'))
      .set(auth)
      .send({
        title: 'Checkout payment error at the final step',
        categoryId: category.body.data.id,
        summary: 'What to do when a payment attempt returns an error page at checkout.',
        body:
          'If checkout fails with a payment error, retry with a different card and confirm the billing address matches your statement.',
        status: 'PUBLISHED',
      })
      .expect(201);

    const articles = await request(http)
      .get(apiPath(`/tickets/${ticketId}/ai/articles`))
      .set(auth)
      .expect(200);
    expect(articles.body.data.length).toBeGreaterThan(0);

    const reply = await generate('SUGGESTED_REPLY').expect(200);
    expect(reply.body.data.content.grounded).toBe(true);
    expect(reply.body.data.content.citedArticleIds.length).toBeGreaterThan(0);
  });

  it('stops at the monthly token budget', async () => {
    await enable({ monthlyTokenBudget: 1 });
    await generate('SUMMARY').expect(200);
    const blocked = await generate('SENTIMENT').expect(400);
    expect(String(blocked.body.error.message)).toMatch(/budget/i);
  });

  it('reports usage for the organization only', async () => {
    await enable();
    await generate('SUMMARY').expect(200);
    await generate('SENTIMENT').expect(200);

    const usage = await request(http).get(apiPath('/ai/usage')).set(auth).expect(200);
    expect(usage.body.data.calls).toBe(2);
    expect(usage.body.data.inputTokens).toBeGreaterThan(0);
    expect((usage.body.data.byType as { type: string }[]).map((r) => r.type).sort()).toEqual([
      'SENTIMENT',
      'SUMMARY',
    ]);
  });

  it('keeps settings, insights and tickets inside their own organization', async () => {
    await enable();
    await generate('SUMMARY').expect(200);

    const other = await registerOrg(http, 'assistant-two', 'owner@assistant-two.example');
    const otherAuth = { Authorization: `Bearer ${other.token}` };

    const settings = await request(http).get(apiPath('/ai/settings')).set(otherAuth).expect(200);
    expect(settings.body.data.isEnabled).toBe(false);

    const usage = await request(http).get(apiPath('/ai/usage')).set(otherAuth).expect(200);
    expect(usage.body.data.calls).toBe(0);

    await request(http).get(apiPath(`/tickets/${ticketId}/ai`)).set(otherAuth).expect(404);
    await request(http)
      .post(apiPath(`/tickets/${ticketId}/ai`))
      .set(otherAuth)
      .send({ type: 'SUMMARY' })
      .expect(404);
  });
});
