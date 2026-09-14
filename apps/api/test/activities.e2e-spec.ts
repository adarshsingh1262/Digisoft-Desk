import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';

describe('Activities (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let auth: { Authorization: string };
  let ticketId: string;
  let contactId: string;

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    const org = await registerOrg(http, 'acts');
    auth = { Authorization: `Bearer ${org.token}` };
    const contact = await request(http).post(apiPath('/contacts')).set(auth).send({ firstName: 'Casey' }).expect(201);
    contactId = contact.body.data.id;
    const ticket = await request(http)
      .post(apiPath('/tickets'))
      .set(auth)
      .send({ subject: 'Needs a follow-up call', description: 'body', contactId })
      .expect(201);
    ticketId = ticket.body.data.id;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('creates a task on a ticket and lists it under that ticket', async () => {
    const created = await request(http)
      .post(apiPath('/activities'))
      .set(auth)
      .send({ type: 'TASK', subject: 'Call back with the fix', ticketId, dueAt: new Date(Date.now() + 3_600_000).toISOString() })
      .expect(201);
    expect(created.body.data.status).toBe('OPEN');
    expect(created.body.data.ticket.id).toBe(ticketId);

    const list = await request(http).get(apiPath(`/activities?ticketId=${ticketId}`)).set(auth).expect(200);
    expect(list.body.meta.total).toBe(1);

    const history = await request(http).get(apiPath(`/tickets/${ticketId}/history`)).set(auth).expect(200);
    expect(history.body.data.map((entry: { action: string }) => entry.action)).toContain('activity.created');
  });

  it('logs a call as already completed and validates event times', async () => {
    const call = await request(http)
      .post(apiPath('/activities'))
      .set(auth)
      .send({ type: 'CALL', subject: 'Spoke to Casey', contactId, callDirection: 'OUTBOUND', callDurationSeconds: 420, callOutcome: 'Resolved' })
      .expect(201);
    expect(call.body.data.status).toBe('COMPLETED');
    expect(call.body.data.completedAt).not.toBeNull();

    await request(http)
      .post(apiPath('/activities'))
      .set(auth)
      .send({ type: 'EVENT', subject: 'Onboarding session', contactId })
      .expect(400);
    await request(http)
      .post(apiPath('/activities'))
      .set(auth)
      .send({ type: 'EVENT', subject: 'Backwards', startAt: '2026-04-02T10:00:00Z', endAt: '2026-04-02T09:00:00Z' })
      .expect(400);
  });

  it('completes and reopens a task, and finds overdue ones', async () => {
    const overdue = await request(http)
      .post(apiPath('/activities'))
      .set(auth)
      .send({ type: 'TASK', subject: 'Late', dueAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(201);
    await request(http)
      .post(apiPath('/activities'))
      .set(auth)
      .send({ type: 'TASK', subject: 'On time', dueAt: new Date(Date.now() + 60_000).toISOString() })
      .expect(201);

    const overdueList = await request(http).get(apiPath('/activities?overdue=true')).set(auth).expect(200);
    expect(overdueList.body.meta.total).toBe(1);

    const done = await request(http).patch(apiPath(`/activities/${overdue.body.data.id}`)).set(auth).send({ status: 'COMPLETED' }).expect(200);
    expect(done.body.data.completedAt).not.toBeNull();
    const reopened = await request(http).patch(apiPath(`/activities/${overdue.body.data.id}`)).set(auth).send({ status: 'OPEN' }).expect(200);
    expect(reopened.body.data.completedAt).toBeNull();
  });

  it('refuses references outside the organization', async () => {
    const other = await registerOrg(http, 'acts-other');
    const otherAuth = { Authorization: `Bearer ${other.token}` };
    await request(http).post(apiPath('/activities')).set(otherAuth).send({ type: 'TASK', subject: 'x', ticketId }).expect(404);
    await request(http).post(apiPath('/activities')).set(otherAuth).send({ type: 'TASK', subject: 'x', contactId }).expect(404);
    const list = await request(http).get(apiPath('/activities')).set(otherAuth).expect(200);
    expect(list.body.meta.total).toBe(0);
  });
});
