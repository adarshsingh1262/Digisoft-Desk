import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';

/** Live chat: a visitor's conversation is a ticket from the first line they type. */
describe('Live chat (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let auth: { Authorization: string };
  let slug: string;

  const portal = (path: string) => apiPath(`/portal/${slug}/chat${path}`);

  const enableChat = () =>
    request(http)
      .post(apiPath('/channels'))
      .set(auth)
      .send({
        type: 'CHAT',
        provider: 'native',
        name: 'Website chat',
        config: { greeting: 'Hi! Ask us anything.', requireEmail: true },
      })
      .expect(201);

  const startChat = async (message = 'Is the API rate limit per key or per organization?') => {
    const response = await request(http)
      .post(portal('/start'))
      .send({ name: 'Priya Nair', email: 'priya@example.test', message })
      .expect(201);
    return {
      token: response.body.data.token as string,
      sessionId: response.body.data.session.id as string,
      ticketId: response.body.data.session.ticket.id as string,
      ticketNumber: response.body.data.session.ticket.ticketNumber as number,
    };
  };

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma, harness.redis);
    const org = await registerOrg(http, 'chat');
    auth = { Authorization: `Bearer ${org.token}` };
    const helpCenter = await request(http).get(apiPath('/help-center')).set(auth).expect(200);
    slug = helpCenter.body.data.slug as string;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('reports chat as unavailable until a chat channel exists', async () => {
    const before = await request(http).get(portal('/config')).expect(200);
    expect(before.body.data.enabled).toBe(false);

    await request(http)
      .post(portal('/start'))
      .send({ message: 'Anyone there?' })
      .expect(400);

    await enableChat();
    const after = await request(http).get(portal('/config')).expect(200);
    expect(after.body.data).toMatchObject({ enabled: true, greeting: 'Hi! Ask us anything.' });
  });

  it('opens a ticket from the first message and queues the chat', async () => {
    await enableChat();
    const chat = await startChat();

    const ticket = await request(http)
      .get(apiPath(`/tickets/${chat.ticketId}`))
      .set(auth)
      .expect(200);
    expect(ticket.body.data).toMatchObject({ source: 'CHAT' });
    expect(ticket.body.data.contact.email).toBe('priya@example.test');

    const sessions = await request(http)
      .get(apiPath('/chat/sessions'))
      .query({ status: 'QUEUED' })
      .set(auth)
      .expect(200);
    expect(sessions.body.data).toHaveLength(1);
  });

  it('carries the conversation both ways', async () => {
    await enableChat();
    const chat = await startChat();

    await request(http)
      .post(apiPath(`/chat/sessions/${chat.sessionId}/accept`))
      .set(auth)
      .expect(201);

    await request(http)
      .post(apiPath(`/tickets/${chat.ticketId}/messages`))
      .set(auth)
      .send({ bodyText: 'Per API key, and the organization has a higher ceiling.' })
      .expect(201);

    await request(http)
      .post(portal('/messages'))
      .set({ 'x-chat-token': chat.token })
      .send({ body: 'Perfect, thank you!' })
      .expect(200);

    const transcript = await request(http)
      .get(portal('/session'))
      .set({ 'x-chat-token': chat.token })
      .expect(200);

    expect(transcript.body.data.session.status).toBe('ACTIVE');
    expect(
      (transcript.body.data.messages as { direction: string }[]).map((m) => m.direction),
    ).toEqual(['INBOUND', 'OUTBOUND', 'INBOUND']);
  });

  it('never shows an internal comment to the visitor', async () => {
    await enableChat();
    const chat = await startChat();

    await request(http)
      .post(apiPath(`/tickets/${chat.ticketId}/comments`))
      .set(auth)
      .send({ bodyText: 'Internal: check the rate limiter config' })
      .expect(201);

    const transcript = await request(http)
      .get(portal('/session'))
      .set({ 'x-chat-token': chat.token })
      .expect(200);
    expect(
      (transcript.body.data.messages as { bodyText: string }[]).map((m) => m.bodyText),
    ).not.toContain('Internal: check the rate limiter config');
  });

  it('refuses a missing or wrong session token', async () => {
    await enableChat();
    await startChat();

    await request(http).get(portal('/session')).expect(401);
    await request(http).get(portal('/session')).set({ 'x-chat-token': 'nonsense' }).expect(401);
  });

  it('ends a chat, records the rating and stops further messages', async () => {
    await enableChat();
    const chat = await startChat();

    const ended = await request(http)
      .post(portal('/end'))
      .set({ 'x-chat-token': chat.token })
      .send({ rating: 5 })
      .expect(200);
    expect(ended.body.data).toMatchObject({ status: 'ENDED', rating: 5 });

    await request(http)
      .post(portal('/messages'))
      .set({ 'x-chat-token': chat.token })
      .send({ body: 'One more thing' })
      .expect(400);
  });

  it('leaves the conversation on its ticket after the chat ends', async () => {
    await enableChat();
    const chat = await startChat('My invoice is wrong');
    await request(http).post(portal('/end')).set({ 'x-chat-token': chat.token }).send({}).expect(200);

    const messages = await request(http)
      .get(apiPath(`/tickets/${chat.ticketId}/messages`))
      .set(auth)
      .expect(200);
    expect(messages.body.data[0].bodyText).toBe('My invoice is wrong');
  });
});
