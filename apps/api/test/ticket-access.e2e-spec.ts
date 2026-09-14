import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';

/**
 * Who can see and do what with a ticket, on top of tenant isolation: record-level read
 * scope, the public-reply / internal-comment split, and the cross-organization boundary.
 */
describe('Ticket access control (e2e)', () => {
  let harness: Harness;
  let http: Server;

  let ownerAuth: { Authorization: string };
  let lightAuth: { Authorization: string };
  let lightUserId: string;
  let ticketId: string;
  let departmentId: string;

  const login = async (email: string, slug: string): Promise<string> => {
    const response = await request(http)
      .post(apiPath('/auth/login'))
      .send({ email, password: 'Str0ngPassword1', organizationSlug: slug })
      .expect(200);
    return response.body.data.accessToken as string;
  };

  const createUserWithRole = async (
    auth: { Authorization: string },
    systemKey: string,
    email: string,
  ): Promise<string> => {
    const roles = await request(http).get(apiPath('/roles')).set(auth).expect(200);
    const roleId = (roles.body.data as { id: string; systemKey: string }[]).find(
      (role) => role.systemKey === systemKey,
    )!.id;

    const created = await request(http)
      .post(apiPath('/users'))
      .set(auth)
      .send({
        firstName: 'Sam',
        lastName: systemKey,
        email,
        password: 'Str0ngPassword1',
        roleIds: [roleId],
      })
      .expect(201);
    return created.body.data.id as string;
  };

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);

    const owner = await registerOrg(http, 'access');
    ownerAuth = { Authorization: `Bearer ${owner.token}` };

    const departments = await request(http).get(apiPath('/departments')).set(ownerAuth).expect(200);
    departmentId = departments.body.data[0].id;

    lightUserId = await createUserWithRole(ownerAuth, 'LIGHT_AGENT', 'light@access.example');
    lightAuth = { Authorization: `Bearer ${await login('light@access.example', 'access')}` };

    const ticket = await request(http)
      .post(apiPath('/tickets'))
      .set(ownerAuth)
      .send({ subject: 'Scoped ticket', description: 'body', departmentId })
      .expect(201);
    ticketId = ticket.body.data.id;

    await request(http)
      .post(apiPath(`/tickets/${ticketId}/comments`))
      .set(ownerAuth)
      .send({ bodyText: 'Internal: customer is on the enterprise plan.' })
      .expect(201);
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('without ticket.read.all', () => {
    it('hides tickets outside the user\'s departments and assignments', async () => {
      const list = await request(http).get(apiPath('/tickets')).set(lightAuth).expect(200);
      expect(list.body.meta.total).toBe(0);

      // 404 rather than 403, so an out-of-scope id is indistinguishable from a missing one.
      await request(http).get(apiPath(`/tickets/${ticketId}`)).set(lightAuth).expect(404);
      await request(http).get(apiPath(`/tickets/${ticketId}/messages`)).set(lightAuth).expect(404);
      await request(http).get(apiPath(`/tickets/${ticketId}/history`)).set(lightAuth).expect(404);
    });

    it('reveals the ticket once the user joins its department', async () => {
      await request(http)
        .patch(apiPath(`/users/${lightUserId}/departments`))
        .set(ownerAuth)
        .send({ departmentIds: [departmentId] })
        .expect(200);

      // The cached access scope is invalidated by the change, so the same token works.
      const list = await request(http).get(apiPath('/tickets')).set(lightAuth).expect(200);
      expect(list.body.meta.total).toBe(1);
      await request(http).get(apiPath(`/tickets/${ticketId}`)).set(lightAuth).expect(200);
    });

    it('reveals a ticket assigned to the user even without the department', async () => {
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/assign`))
        .set(ownerAuth)
        .send({ assignedAgentId: lightUserId })
        .expect(200);

      const list = await request(http).get(apiPath('/tickets')).set(lightAuth).expect(200);
      expect(list.body.meta.total).toBe(1);
    });
  });

  describe('reply and comment permissions', () => {
    beforeEach(async () => {
      await request(http)
        .patch(apiPath(`/users/${lightUserId}/departments`))
        .set(ownerAuth)
        .send({ departmentIds: [departmentId] })
        .expect(200);
    });

    it('lets a light agent comment internally but never reply to the customer', async () => {
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/comments`))
        .set(lightAuth)
        .send({ bodyText: 'Checked the auth logs.' })
        .expect(201);

      const reply = await request(http)
        .post(apiPath(`/tickets/${ticketId}/messages`))
        .set(lightAuth)
        .send({ bodyText: 'Hello customer' })
        .expect(403);
      expect(reply.body.error.code).toBe('PERMISSION_DENIED');
    });

    it('refuses configuration changes to anyone without ticket.config', async () => {
      await request(http)
        .post(apiPath('/tags'))
        .set(lightAuth)
        .send({ name: 'nope' })
        .expect(403);
      await request(http)
        .post(apiPath('/ticket-statuses'))
        .set(lightAuth)
        .send({ name: 'Nope' })
        .expect(403);
    });
  });

  describe('across organizations', () => {
    let otherAuth: { Authorization: string };

    beforeEach(async () => {
      const other = await registerOrg(http, 'intruder');
      otherAuth = { Authorization: `Bearer ${other.token}` };
    });

    it('never exposes another organization\'s ticket, conversation or history', async () => {
      const list = await request(http).get(apiPath('/tickets')).set(otherAuth).expect(200);
      expect(list.body.meta.total).toBe(0);

      await request(http).get(apiPath(`/tickets/${ticketId}`)).set(otherAuth).expect(404);
      await request(http).get(apiPath(`/tickets/${ticketId}/messages`)).set(otherAuth).expect(404);
      await request(http).get(apiPath(`/tickets/${ticketId}/history`)).set(otherAuth).expect(404);
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/messages`))
        .set(otherAuth)
        .send({ bodyText: 'Injected' })
        .expect(404);
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/assign`))
        .set(otherAuth)
        .send({ assignedAgentId: null })
        .expect(404);
      await request(http).delete(apiPath(`/tickets/${ticketId}`)).set(otherAuth).expect(404);
    });

    it('will not apply another organization\'s status, priority or tag', async () => {
      const statuses = await request(http)
        .get(apiPath('/ticket-statuses'))
        .set(ownerAuth)
        .expect(200);
      const foreignStatusId = statuses.body.data[1].id as string;

      const intruderTicket = await request(http)
        .post(apiPath('/tickets'))
        .set(otherAuth)
        .send({ subject: 'Own ticket', description: 'body' })
        .expect(201);

      await request(http)
        .post(apiPath(`/tickets/${intruderTicket.body.data.id}/status`))
        .set(otherAuth)
        .send({ statusId: foreignStatusId })
        .expect(404);
    });

    it('keeps each organization\'s ticket numbering independent', async () => {
      const theirs = await request(http)
        .post(apiPath('/tickets'))
        .set(otherAuth)
        .send({ subject: 'Their first ticket', description: 'body' })
        .expect(201);
      expect(theirs.body.data.ticketNumber).toBe(1);
    });
  });
});
