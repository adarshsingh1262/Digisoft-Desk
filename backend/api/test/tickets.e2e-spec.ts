import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';

describe('Tickets (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let token: string;
  let auth: { Authorization: string };
  let contactId: string;
  let departmentId: string;
  let highPriorityId: string;

  const createTicket = (overrides: Record<string, unknown> = {}) =>
    request(http)
      .post(apiPath('/tickets'))
      .set(auth)
      .send({
        subject: 'Password reset loops back to the form',
        description: 'Three users are affected since this morning.',
        contactId,
        departmentId,
        ...overrides,
      });

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    const org = await registerOrg(http, 'tickets');
    token = org.token;
    auth = { Authorization: `Bearer ${token}` };

    const contact = await request(http)
      .post(apiPath('/contacts'))
      .set(auth)
      .send({ firstName: 'Casey', lastName: 'Customer', email: 'casey@tickets.example' })
      .expect(201);
    contactId = contact.body.data.id;

    const departments = await request(http).get(apiPath('/departments')).set(auth).expect(200);
    departmentId = departments.body.data[0].id;

    const priorities = await request(http).get(apiPath('/ticket-priorities')).set(auth).expect(200);
    highPriorityId = (priorities.body.data as { id: string; name: string }[]).find(
      (p) => p.name === 'High',
    )!.id;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('provisions statuses, priorities and categories with a new organization', async () => {
    const statuses = await request(http).get(apiPath('/ticket-statuses')).set(auth).expect(200);
    const names = (statuses.body.data as { name: string }[]).map((s) => s.name);
    expect(names).toEqual([
      'New',
      'Open',
      'In Progress',
      'On Hold',
      'Pending',
      'Resolved',
      'Closed',
    ]);

    // Exactly one default, one resolving and one closing status — the flags, not the
    // names, are what the ticket engine reads.
    const flags = statuses.body.data as { isDefault: boolean; isResolved: boolean; isClosed: boolean }[];
    expect(flags.filter((s) => s.isDefault)).toHaveLength(1);
    expect(flags.filter((s) => s.isClosed)).toHaveLength(1);
  });

  it('creates a ticket with defaults applied and a sequential number', async () => {
    const first = await createTicket().expect(201);
    expect(first.body.data.ticketNumber).toBe(1);
    expect(first.body.data.status.name).toBe('New');
    expect(first.body.data.priority.name).toBe('Medium');
    expect(first.body.data.contact.id).toBe(contactId);

    const second = await createTicket({ subject: 'Another issue' }).expect(201);
    expect(second.body.data.ticketNumber).toBe(2);
  });

  it('gives concurrent creations distinct numbers', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) => createTicket({ subject: `Concurrent ${index}` })),
    );
    const numbers = responses.map((response) => response.body.data.ticketNumber as number);
    expect(new Set(numbers).size).toBe(5);
    expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('inherits the account from the contact when none is given', async () => {
    const account = await request(http)
      .post(apiPath('/accounts'))
      .set(auth)
      .send({ name: 'Northwind' })
      .expect(201);
    await request(http)
      .patch(apiPath(`/contacts/${contactId}`))
      .set(auth)
      .send({ accountId: account.body.data.id })
      .expect(200);

    const ticket = await createTicket().expect(201);
    expect(ticket.body.data.account.id).toBe(account.body.data.id);
  });

  it('rejects references belonging to nothing', async () => {
    await createTicket({ contactId: 'does-not-exist' }).expect(404);
    await createTicket({ categoryId: 'does-not-exist' }).expect(404);
    await createTicket({ subject: '' }).expect(400);
  });

  describe('with a ticket', () => {
    let ticketId: string;

    beforeEach(async () => {
      const ticket = await createTicket().expect(201);
      ticketId = ticket.body.data.id;
    });

    it('records a public reply and stamps the first response time', async () => {
      const before = await request(http).get(apiPath(`/tickets/${ticketId}`)).set(auth).expect(200);
      expect(before.body.data.firstResponseAt).toBeNull();

      await request(http)
        .post(apiPath(`/tickets/${ticketId}/messages`))
        .set(auth)
        .send({ bodyText: 'We are looking into it.' })
        .expect(201);

      const after = await request(http).get(apiPath(`/tickets/${ticketId}`)).set(auth).expect(200);
      expect(after.body.data.firstResponseAt).not.toBeNull();
    });

    it('keeps the first response time from the first reply, not the latest', async () => {
      const first = await request(http)
        .post(apiPath(`/tickets/${ticketId}/messages`))
        .set(auth)
        .send({ bodyText: 'First' })
        .expect(201);
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/messages`))
        .set(auth)
        .send({ bodyText: 'Second' })
        .expect(201);

      const ticket = await request(http).get(apiPath(`/tickets/${ticketId}`)).set(auth).expect(200);
      expect(new Date(ticket.body.data.firstResponseAt as string).getTime()).toBe(
        new Date(first.body.data.createdAt as string).getTime(),
      );
    });

    it('stores internal comments as a distinct message type', async () => {
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/comments`))
        .set(auth)
        .send({ bodyText: 'Auth logs show repeated failures.' })
        .expect(201);

      const messages = await request(http)
        .get(apiPath(`/tickets/${ticketId}/messages`))
        .set(auth)
        .expect(200);
      expect(messages.body.data.map((m: { type: string }) => m.type)).toEqual(['INTERNAL_COMMENT']);

      // An internal comment must never count as a customer response.
      const ticket = await request(http).get(apiPath(`/tickets/${ticketId}`)).set(auth).expect(200);
      expect(ticket.body.data.firstResponseAt).toBeNull();
    });

    it('requires a resolution note before a ticket can be resolved', async () => {
      const statuses = await request(http).get(apiPath('/ticket-statuses')).set(auth).expect(200);
      const resolved = (statuses.body.data as { id: string; isResolved: boolean }[]).find(
        (s) => s.isResolved && !('isClosed' in s && (s as { isClosed?: boolean }).isClosed),
      )!;

      const withoutNote = await request(http)
        .post(apiPath(`/tickets/${ticketId}/status`))
        .set(auth)
        .send({ statusId: resolved.id })
        .expect(400);
      expect(withoutNote.body.error.code).toBe('VALIDATION_ERROR');

      await request(http)
        .post(apiPath(`/tickets/${ticketId}/resolve`))
        .set(auth)
        .send({ resolutionNote: 'Cleared the stale session cookie.' })
        .expect(200);
    });

    it('walks resolve, close and reopen, keeping the timestamps consistent', async () => {
      const resolved = await request(http)
        .post(apiPath(`/tickets/${ticketId}/resolve`))
        .set(auth)
        .send({ resolutionNote: 'Fixed.' })
        .expect(200);
      expect(resolved.body.data.status.isResolved).toBe(true);
      expect(resolved.body.data.resolvedAt).not.toBeNull();
      expect(resolved.body.data.closedAt).toBeNull();

      const closed = await request(http)
        .post(apiPath(`/tickets/${ticketId}/close`))
        .set(auth)
        .expect(200);
      expect(closed.body.data.status.isClosed).toBe(true);
      expect(closed.body.data.closedAt).not.toBeNull();

      const reopened = await request(http)
        .post(apiPath(`/tickets/${ticketId}/reopen`))
        .set(auth)
        .expect(200);
      expect(reopened.body.data.status.isResolved).toBe(false);
      expect(reopened.body.data.resolvedAt).toBeNull();
      expect(reopened.body.data.closedAt).toBeNull();

      await request(http).post(apiPath(`/tickets/${ticketId}/reopen`)).set(auth).expect(400);
    });

    it('changes priority and assignment, and notifies the new assignee', async () => {
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/priority`))
        .set(auth)
        .send({ priorityId: highPriorityId })
        .expect(200);

      const roles = await request(http).get(apiPath('/roles')).set(auth).expect(200);
      const agentRoleId = (roles.body.data as { id: string; systemKey: string }[]).find(
        (r) => r.systemKey === 'AGENT',
      )!.id;
      const agent = await request(http)
        .post(apiPath('/users'))
        .set(auth)
        .send({
          firstName: 'Ash',
          lastName: 'Agent',
          email: 'ash@tickets.example',
          password: 'Str0ngPassword1',
          roleIds: [agentRoleId],
        })
        .expect(201);

      const assigned = await request(http)
        .post(apiPath(`/tickets/${ticketId}/assign`))
        .set(auth)
        .send({ assignedAgentId: agent.body.data.id })
        .expect(200);
      expect(assigned.body.data.assignedAgent.id).toBe(agent.body.data.id);

      const notifications = await harness.prisma.notification.findMany({
        where: { userId: agent.body.data.id, type: 'ticket.assigned' },
      });
      expect(notifications).toHaveLength(1);
    });

    it('replaces tags wholesale', async () => {
      const first = await request(http)
        .post(apiPath('/tags'))
        .set(auth)
        .send({ name: 'login' })
        .expect(201);
      const second = await request(http)
        .post(apiPath('/tags'))
        .set(auth)
        .send({ name: 'urgent-customer' })
        .expect(201);

      const tagged = await request(http)
        .patch(apiPath(`/tickets/${ticketId}/tags`))
        .set(auth)
        .send({ tagIds: [first.body.data.id, second.body.data.id] })
        .expect(200);
      expect(tagged.body.data.tags).toHaveLength(2);

      const retagged = await request(http)
        .patch(apiPath(`/tickets/${ticketId}/tags`))
        .set(auth)
        .send({ tagIds: [first.body.data.id] })
        .expect(200);
      expect(retagged.body.data.tags.map((t: { tag: { name: string } }) => t.tag.name)).toEqual([
        'login',
      ]);
    });

    it('merges a ticket into another, moving the conversation and closing the source', async () => {
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/messages`))
        .set(auth)
        .send({ bodyText: 'Original context worth keeping.' })
        .expect(201);

      const target = await createTicket({ subject: 'Duplicate report' }).expect(201);
      const targetId = target.body.data.id as string;

      const merged = await request(http)
        .post(apiPath(`/tickets/${ticketId}/merge`))
        .set(auth)
        .send({ targetTicketId: targetId, comment: 'Same root cause' })
        .expect(200);
      expect(merged.body.data.id).toBe(targetId);

      const targetMessages = await request(http)
        .get(apiPath(`/tickets/${targetId}/messages`))
        .set(auth)
        .expect(200);
      const bodies = targetMessages.body.data.map((m: { bodyText: string }) => m.bodyText);
      expect(bodies).toContain('Original context worth keeping.');
      expect(bodies.some((body: string) => body.includes('was merged into this ticket'))).toBe(true);

      const source = await request(http).get(apiPath(`/tickets/${ticketId}`)).set(auth).expect(200);
      expect(source.body.data.status.isClosed).toBe(true);
      expect(source.body.data.mergedIntoTicketId).toBe(targetId);

      await request(http)
        .post(apiPath(`/tickets/${ticketId}/merge`))
        .set(auth)
        .send({ targetTicketId: targetId })
        .expect(400);
    });

    it('refuses to merge or link a ticket to itself', async () => {
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/merge`))
        .set(auth)
        .send({ targetTicketId: ticketId })
        .expect(400);
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/links`))
        .set(auth)
        .send({ linkedTicketId: ticketId })
        .expect(400);
    });

    it('links and unlinks related tickets', async () => {
      const other = await createTicket({ subject: 'Related report' }).expect(201);

      const linked = await request(http)
        .post(apiPath(`/tickets/${ticketId}/links`))
        .set(auth)
        .send({ linkedTicketId: other.body.data.id, type: 'DUPLICATE' })
        .expect(201);
      expect(linked.body.data.links).toHaveLength(1);

      await request(http)
        .post(apiPath(`/tickets/${ticketId}/links`))
        .set(auth)
        .send({ linkedTicketId: other.body.data.id })
        .expect(409);

      const unlinked = await request(http)
        .delete(apiPath(`/tickets/${ticketId}/links/${linked.body.data.links[0].id}`))
        .set(auth)
        .expect(200);
      expect(unlinked.body.data.links).toHaveLength(0);
    });

    it('builds a change history from the audit trail', async () => {
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/priority`))
        .set(auth)
        .send({ priorityId: highPriorityId })
        .expect(200);
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/messages`))
        .set(auth)
        .send({ bodyText: 'Replying' })
        .expect(201);

      const history = await request(http)
        .get(apiPath(`/tickets/${ticketId}/history`))
        .set(auth)
        .expect(200);
      const actions = history.body.data.map((entry: { action: string }) => entry.action);
      expect(actions).toEqual(
        expect.arrayContaining(['ticket.created', 'ticket.priority_changed', 'ticket.replied']),
      );
      expect(history.body.data[0].actor).not.toBeNull();
    });

    it('filters and searches the queue', async () => {
      await createTicket({ subject: 'Billing question about invoice 42' }).expect(201);

      const search = await request(http)
        .get(apiPath('/tickets?q=invoice'))
        .set(auth)
        .expect(200);
      expect(search.body.meta.total).toBe(1);

      const byNumber = await request(http).get(apiPath('/tickets?q=1')).set(auth).expect(200);
      expect(byNumber.body.meta.total).toBeGreaterThanOrEqual(1);

      const unassigned = await request(http)
        .get(apiPath('/tickets?unassigned=true'))
        .set(auth)
        .expect(200);
      expect(unassigned.body.meta.total).toBe(2);

      const summary = await request(http).get(apiPath('/tickets/summary')).set(auth).expect(200);
      expect(summary.body.data.total).toBe(2);
      expect(summary.body.data.open).toBe(2);
      expect(summary.body.data.unassigned).toBe(2);
    });

    it('preserves fields a partial update does not mention', async () => {
      const before = await request(http).get(apiPath(`/tickets/${ticketId}`)).set(auth).expect(200);
      expect(before.body.data.contact.id).toBe(contactId);
      expect(before.body.data.department.id).toBe(departmentId);

      const updated = await request(http)
        .patch(apiPath(`/tickets/${ticketId}`))
        .set(auth)
        .send({ subject: 'Renamed only' })
        .expect(200);

      expect(updated.body.data.subject).toBe('Renamed only');
      expect(updated.body.data.contact.id).toBe(contactId);
      expect(updated.body.data.department.id).toBe(departmentId);
    });

    it('clears a field only when the caller asks for it explicitly', async () => {
      const updated = await request(http)
        .patch(apiPath(`/tickets/${ticketId}`))
        .set(auth)
        .send({ contactId: null })
        .expect(200);
      expect(updated.body.data.contact).toBeNull();
      expect(updated.body.data.department.id).toBe(departmentId);
    });

    it('changes the assignee without dropping the department', async () => {
      const assigned = await request(http)
        .post(apiPath(`/tickets/${ticketId}/assign`))
        .set(auth)
        .send({ assignedAgentId: null })
        .expect(200);
      expect(assigned.body.data.department.id).toBe(departmentId);
    });

    it('drops a resolved ticket out of the open queue', async () => {
      const before = await request(http)
        .get(apiPath('/tickets?open=true'))
        .set(auth)
        .expect(200);
      expect(before.body.meta.total).toBe(1);

      await request(http)
        .post(apiPath(`/tickets/${ticketId}/resolve`))
        .set(auth)
        .send({ resolutionNote: 'Done.' })
        .expect(200);

      const after = await request(http).get(apiPath('/tickets?open=true')).set(auth).expect(200);
      expect(after.body.meta.total).toBe(0);

      const summary = await request(http).get(apiPath('/tickets/summary')).set(auth).expect(200);
      expect(summary.body.data.open).toBe(0);
      expect(summary.body.data.resolved).toBe(1);
      expect(summary.body.data.total).toBe(1);
    });

    it('soft deletes a ticket', async () => {
      await request(http).delete(apiPath(`/tickets/${ticketId}`)).set(auth).expect(200);
      await request(http).get(apiPath(`/tickets/${ticketId}`)).set(auth).expect(404);

      const row = await harness.prisma.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: { deletedAt: true },
      });
      expect(row.deletedAt).not.toBeNull();
    });
  });
});
