import request from 'supertest';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';

/**
 * Inbound and outbound channels, end to end: a provider posts a signed payload and a
 * ticket comes out the other side, threaded, deduplicated and attributed to a contact.
 */
describe('Channels (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let auth: { Authorization: string };

  const SIGNING_SECRET = 'inbound-signing-secret';

  const createEmailChannel = async (overrides: Record<string, unknown> = {}) => {
    const response = await request(http)
      .post(apiPath('/channels'))
      .set(auth)
      .send({
        type: 'EMAIL',
        provider: 'generic',
        name: 'Support inbox',
        identifier: 'support@example.test',
        config: { stripQuotedText: true },
        secrets: { signingSecret: SIGNING_SECRET },
        ...overrides,
      })
      .expect(201);
    const url = new URL(response.body.data.webhookUrl as string);
    return { id: response.body.data.id as string, path: url.pathname, body: response.body.data };
  };

  const post = (path: string, payload: Record<string, unknown>, secret = SIGNING_SECRET) => {
    const raw = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(raw).digest('hex');
    return request(http)
      .post(path)
      .set('Content-Type', 'application/json')
      .set('x-digisoft-signature', signature)
      .send(raw);
  };

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma, harness.redis);
    const org = await registerOrg(http, 'channels');
    auth = { Authorization: `Bearer ${org.token}` };
  });

  afterAll(async () => {
    await harness.close();
  });

  it('never returns the credentials it stores', async () => {
    const channel = await createEmailChannel();
    expect(channel.body.configuredSecrets).toEqual(['signingSecret']);
    expect(JSON.stringify(channel.body)).not.toContain(SIGNING_SECRET);

    const fetched = await request(http).get(apiPath(`/channels/${channel.id}`)).set(auth).expect(200);
    expect(fetched.body.data.secrets).toBeUndefined();
    expect(fetched.body.data.webhookUrl).toBeUndefined();
    expect(fetched.body.data.configuredSecrets).toEqual(['signingSecret']);
  });

  it('refuses a provider that does not belong to the channel type', async () => {
    await request(http)
      .post(apiPath('/channels'))
      .set(auth)
      .send({ type: 'EMAIL', provider: 'telegram', name: 'Wrong' })
      .expect(400);
  });

  it('turns a signed inbound email into a ticket with a contact and an attachment', async () => {
    const channel = await createEmailChannel();

    const response = await post(channel.path, {
      messageId: '<first@mail.test>',
      from: '"Rhea Kapoor" <rhea@example.test>',
      to: 'support@example.test',
      subject: 'Export fails above 500 rows',
      text: 'Every large export crashes the tab.',
      attachments: [{ fileName: 'log.txt', mimeType: 'text/plain', contentBase64: 'aGVsbG8=' }],
    }).expect(200);

    expect(response.body.data.results[0]).toMatchObject({ status: 'PROCESSED' });

    const tickets = await request(http).get(apiPath('/tickets')).set(auth).expect(200);
    expect(tickets.body.data[0]).toMatchObject({
      subject: 'Export fails above 500 rows',
      source: 'EMAIL',
    });
    expect(tickets.body.data[0].contact.email).toBe('rhea@example.test');

    const ticketId = tickets.body.data[0].id as string;
    const messages = await request(http)
      .get(apiPath(`/tickets/${ticketId}/messages`))
      .set(auth)
      .expect(200);
    expect(messages.body.data[0].direction).toBe('INBOUND');
    expect(messages.body.data[0].attachments[0].fileName).toBe('log.txt');
  });

  it('refuses an unsigned delivery and an unknown webhook secret', async () => {
    const channel = await createEmailChannel();

    await request(http)
      .post(channel.path)
      .send({ messageId: '<x@mail.test>', from: 'rhea@example.test', text: 'hello' })
      .expect(403);

    await post(channel.path.replace(/\/[^/]+$/, '/not-the-secret'), {
      messageId: '<y@mail.test>',
      from: 'rhea@example.test',
      text: 'hello',
    }).expect(404);
  });

  it('accepts the same delivery twice without creating two tickets', async () => {
    const channel = await createEmailChannel();
    const payload = {
      messageId: '<dupe@mail.test>',
      from: 'rhea@example.test',
      to: 'support@example.test',
      subject: 'Duplicate delivery',
      text: 'Only one ticket, please.',
    };

    await post(channel.path, payload).expect(200);
    const second = await post(channel.path, payload).expect(200);
    expect(second.body.data.results[0]).toEqual({ status: 'DUPLICATE' });

    const tickets = await request(http).get(apiPath('/tickets')).set(auth).expect(200);
    expect(tickets.body.data).toHaveLength(1);
  });

  it('ignores an auto-reply instead of answering it', async () => {
    const channel = await createEmailChannel();

    const response = await post(channel.path, {
      messageId: '<ooo@mail.test>',
      from: 'rhea@example.test',
      subject: 'Out of office',
      text: 'I am away until Monday.',
      headers: { 'Auto-Submitted': 'auto-replied' },
    }).expect(200);

    expect(response.body.data.results[0].status).toBe('IGNORED');
    const tickets = await request(http).get(apiPath('/tickets')).set(auth).expect(200);
    expect(tickets.body.data).toEqual([]);
  });

  it('threads a reply onto the original ticket and reopens it', async () => {
    const channel = await createEmailChannel();
    await post(channel.path, {
      messageId: '<thread-1@mail.test>',
      from: 'rhea@example.test',
      subject: 'Billing question',
      text: 'How do I download an invoice?',
    }).expect(200);

    const tickets = await request(http).get(apiPath('/tickets')).set(auth).expect(200);
    const ticketId = tickets.body.data[0].id as string;

    await request(http)
      .post(apiPath(`/tickets/${ticketId}/resolve`))
      .set(auth)
      .send({ resolutionNote: 'Explained' })
      .expect(200);

    await post(channel.path, {
      messageId: '<thread-2@mail.test>',
      from: 'rhea@example.test',
      subject: 'Re: Billing question',
      inReplyTo: '<thread-1@mail.test>',
      references: '<thread-1@mail.test>',
      text: 'That did not work.',
    }).expect(200);

    const after = await request(http).get(apiPath(`/tickets/${ticketId}`)).set(auth).expect(200);
    expect(after.body.data.status.isResolved).toBe(false);

    const all = await request(http).get(apiPath('/tickets')).set(auth).expect(200);
    expect(all.body.data).toHaveLength(1);
  });

  it('threads on the ticket number a mail client carried back in the subject', async () => {
    const channel = await createEmailChannel();
    await post(channel.path, {
      messageId: '<subject-1@mail.test>',
      from: 'rhea@example.test',
      subject: 'Password reset',
      text: 'I cannot reset my password.',
    }).expect(200);

    const tickets = await request(http).get(apiPath('/tickets')).set(auth).expect(200);
    const number = tickets.body.data[0].ticketNumber as number;

    await post(channel.path, {
      messageId: '<subject-2@mail.test>',
      from: 'rhea@example.test',
      subject: `Re: [#${number}] Password reset`,
      text: 'Still stuck.',
    }).expect(200);

    const all = await request(http).get(apiPath('/tickets')).set(auth).expect(200);
    expect(all.body.data).toHaveLength(1);
  });

  it('keeps a messaging conversation on one ticket while it is open', async () => {
    const created = await request(http)
      .post(apiPath('/channels'))
      .set(auth)
      .send({
        type: 'TELEGRAM',
        provider: 'telegram',
        name: 'Support bot',
        identifier: 'support_bot',
        secrets: { botToken: '123:test', secretToken: 'tg-secret' },
      })
      .expect(201);
    const path = new URL(created.body.data.webhookUrl as string).pathname;

    const send = (updateId: number, text: string) =>
      request(http)
        .post(path)
        .set('x-telegram-bot-api-secret-token', 'tg-secret')
        .send({
          update_id: updateId,
          message: {
            message_id: updateId,
            chat: { id: 4242 },
            from: { first_name: 'Arun', last_name: 'Prakash' },
            text,
          },
        })
        .expect(200);

    await send(1, 'My order has not shipped');
    await send(2, 'Any update?');

    const tickets = await request(http).get(apiPath('/tickets')).set(auth).expect(200);
    expect(tickets.body.data).toHaveLength(1);
    expect(tickets.body.data[0].source).toBe('TELEGRAM');

    const messages = await request(http)
      .get(apiPath(`/tickets/${tickets.body.data[0].id as string}/messages`))
      .set(auth)
      .expect(200);
    expect(messages.body.data).toHaveLength(2);
  });

  it('records a telephony webhook as a completed call', async () => {
    const created = await request(http)
      .post(apiPath('/channels'))
      .set(auth)
      .send({
        type: 'VOICE',
        provider: 'twilio',
        name: 'Support line',
        identifier: '+15550002222',
        secrets: { accountSid: 'ACtest', authToken: 'twilio-token' },
      })
      .expect(201);

    const path = new URL(created.body.data.webhookUrl as string).pathname;
    const params = {
      CallSid: 'CA-1',
      From: '+15550001111',
      To: '+15550002222',
      CallStatus: 'completed',
      Direction: 'inbound',
      CallDuration: '142',
    };

    // Twilio signs the absolute URL the request arrived at, so the signature is built
    // over the same host header this request will carry.
    const port = (http.address() as { port: number } | null)?.port ?? 0;
    const absolute = `http://127.0.0.1:${port}${path}`;
    const payload = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + String(params[key as keyof typeof params]), absolute);
    const signature = createHmac('sha1', 'twilio-token').update(payload).digest('base64');

    await request(http)
      .post(path)
      .set('Content-Type', 'application/json')
      .set('x-twilio-signature', signature)
      .set('Host', `127.0.0.1:${port}`)
      .send(JSON.stringify(params))
      .expect(200);

    const activities = await request(http)
      .get(apiPath('/activities'))
      .query({ type: 'CALL' })
      .set(auth)
      .expect(200);
    expect(activities.body.data[0]).toMatchObject({
      callDirection: 'INBOUND',
      callDurationSeconds: 142,
      status: 'COMPLETED',
    });
  });

  it('keeps one organization out of the channel list of another', async () => {
    await createEmailChannel();
    const other = await registerOrg(http, 'channels-two', 'owner@channels-two.example');

    const channels = await request(http)
      .get(apiPath('/channels'))
      .set({ Authorization: `Bearer ${other.token}` })
      .expect(200);
    expect(channels.body.data).toEqual([]);
  });
});
