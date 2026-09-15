import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';

/**
 * Phase 7, end to end: dashboards and reports read real ticket data, a resolved ticket
 * schedules exactly one satisfaction survey, and the public survey endpoints work off
 * nothing but the emailed token's hash — there is no session behind them.
 */
describe('Analytics and CSAT (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let auth: { Authorization: string };
  let organizationId: string;
  let contactId: string;
  let agentId: string;
  let resolvedStatusId: string;

  const createTicket = (overrides: Record<string, unknown> = {}) =>
    request(http)
      .post(apiPath('/tickets'))
      .set(auth)
      .send({
        subject: 'Checkout fails with a payment error',
        description: 'Every payment attempt returns an error page.',
        contactId,
        ...overrides,
      })
      .expect(201);

  const resolveTicket = (ticketId: string) =>
    request(http)
      .post(apiPath(`/tickets/${ticketId}/resolve`))
      .set(auth)
      .send({ resolutionNote: 'Fixed the payment gateway configuration.' })
      .expect(200);

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma, harness.redis);
    const org = await registerOrg(http, 'analytics');
    auth = { Authorization: `Bearer ${org.token}` };
    organizationId = org.organizationId;
    agentId = org.userId;

    const contact = await request(http)
      .post(apiPath('/contacts'))
      .set(auth)
      .send({ firstName: 'Casey', lastName: 'Customer', email: 'casey@analytics.example' })
      .expect(201);
    contactId = contact.body.data.id;

    const statuses = await request(http).get(apiPath('/ticket-statuses')).set(auth).expect(200);
    resolvedStatusId = (statuses.body.data as { id: string; isResolved: boolean }[]).find(
      (s) => s.isResolved,
    )!.id;
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('dashboard and reports', () => {
    it('reflects real ticket activity and stays scoped to the organization', async () => {
      const ticket = await createTicket();
      const ticketId = ticket.body.data.id;

      await request(http)
        .post(apiPath(`/tickets/${ticketId}/assign`))
        .set(auth)
        .send({ assignedAgentId: agentId })
        .expect(200);
      await request(http)
        .post(apiPath(`/tickets/${ticketId}/messages`))
        .set(auth)
        .send({ bodyText: 'Looking into it now.', type: 'PUBLIC_REPLY' })
        .expect(201);
      await resolveTicket(ticketId);

      const dashboard = await request(http)
        .get(apiPath('/dashboard?range=30d'))
        .set(auth)
        .expect(200);
      expect(dashboard.body.data.tickets.created).toBe(1);
      expect(dashboard.body.data.tickets.resolved).toBe(1);
      expect(dashboard.body.data.tickets.resolutionRate).toBe(100);
      expect(dashboard.body.data.sla.resolutionCompliance).toBe(100);

      const agents = await request(http).get(apiPath('/reports/agents?range=30d')).set(auth).expect(200);
      const row = (agents.body.data.rows as { agentId: string; resolved: number }[]).find(
        (r) => r.agentId === agentId,
      );
      expect(row?.resolved).toBe(1);

      const sla = await request(http).get(apiPath('/reports/sla?range=30d')).set(auth).expect(200);
      expect(sla.body.data.totals.resolutions).toBe(1);
      expect(sla.body.data.totals.resolutionMet).toBe(1);

      // A second organization must see none of this.
      const other = await registerOrg(http, 'analytics-two', 'owner@analytics-two.example');
      const otherAuth = { Authorization: `Bearer ${other.token}` };
      const otherDashboard = await request(http)
        .get(apiPath('/dashboard?range=30d'))
        .set(otherAuth)
        .expect(200);
      expect(otherDashboard.body.data.tickets.created).toBe(0);
    });

    it('rejects a custom range missing an end date', async () => {
      const response = await request(http)
        .get(apiPath('/reports/tickets?range=custom&from=2026-01-01'))
        .set(auth)
        .expect(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('report exports', () => {
    it('queues an export and lists it for the organization only', async () => {
      const created = await request(http)
        .post(apiPath('/reports/export'))
        .set(auth)
        .send({ kind: 'TICKETS', filters: { range: '7d' } })
        .expect(201);
      expect(created.body.data.status).toBe('QUEUED');

      const list = await request(http).get(apiPath('/reports/exports')).set(auth).expect(200);
      expect(list.body.data.some((row: { id: string }) => row.id === created.body.data.id)).toBe(true);

      const other = await registerOrg(http, 'analytics-export', 'owner@analytics-export.example');
      const otherList = await request(http)
        .get(apiPath('/reports/exports'))
        .set({ Authorization: `Bearer ${other.token}` })
        .expect(200);
      expect(otherList.body.data).toEqual([]);
    });

    it('refuses a download while the export is still queued', async () => {
      const created = await request(http)
        .post(apiPath('/reports/export'))
        .set(auth)
        .send({ kind: 'TICKETS', filters: { range: '7d' } })
        .expect(201);
      const response = await request(http)
        .get(apiPath(`/reports/exports/${created.body.data.id}/download`))
        .set(auth)
        .expect(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('report definitions', () => {
    it('saves, updates and deletes a named filter set', async () => {
      const created = await request(http)
        .post(apiPath('/report-definitions'))
        .set(auth)
        .send({ name: 'Weekly SLA', kind: 'SLA', filters: { range: '7d' } })
        .expect(201);

      await request(http)
        .post(apiPath('/report-definitions'))
        .set(auth)
        .send({ name: 'Weekly SLA', kind: 'SLA', filters: { range: '7d' } })
        .expect(409);

      const updated = await request(http)
        .patch(apiPath(`/report-definitions/${created.body.data.id}`))
        .set(auth)
        .send({ name: 'Weekly SLA v2' })
        .expect(200);
      expect(updated.body.data.name).toBe('Weekly SLA v2');

      await request(http).delete(apiPath(`/report-definitions/${created.body.data.id}`)).set(auth).expect(200);
      const list = await request(http).get(apiPath('/report-definitions')).set(auth).expect(200);
      expect(list.body.data).toEqual([]);
    });

    it('refuses report.manage actions without the permission', async () => {
      // The AGENT role carries report.read (it needs the dashboard) but not
      // report.manage — only an administrator configures saved reports.
      const roles = await request(http).get(apiPath('/roles')).set(auth).expect(200);
      const agentRoleId = (roles.body.data as { id: string; systemKey: string }[]).find(
        (role) => role.systemKey === 'AGENT',
      )!.id;

      await request(http)
        .post(apiPath('/users'))
        .set(auth)
        .send({
          firstName: 'Alex',
          lastName: 'Agent',
          email: 'alex@analytics.example',
          password: 'Str0ngPassword1',
          roleIds: [agentRoleId],
        })
        .expect(201);
      const login = await request(http)
        .post(apiPath('/auth/login'))
        .send({ email: 'alex@analytics.example', password: 'Str0ngPassword1', organizationSlug: 'analytics' })
        .expect(200);
      const agentAuth = { Authorization: `Bearer ${login.body.data.accessToken as string}` };

      await request(http).get(apiPath('/dashboard?range=30d')).set(agentAuth).expect(200);
      const forbidden = await request(http)
        .post(apiPath('/report-definitions'))
        .set(agentAuth)
        .send({ name: 'Should fail', kind: 'TICKETS', filters: { range: '7d' } })
        .expect(403);
      expect(forbidden.body.error.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('satisfaction surveys', () => {
    it('schedules exactly one survey per ticket resolution', async () => {
      await request(http)
        .patch(apiPath('/csat/settings'))
        .set(auth)
        .send({ isEnabled: true, delayMinutes: 0 })
        .expect(200);

      const ticket = await createTicket();
      const ticketId = ticket.body.data.id;
      await resolveTicket(ticketId);

      const survey = await request(http).get(apiPath(`/tickets/${ticketId}/csat`)).set(auth).expect(200);
      expect(survey.body.data.status).toBe('PENDING');

      const count = await harness.prisma.csatResponse.count({ where: { ticketId } });
      expect(count).toBe(1);

      // Reopen (a customer reply) and resolve again: still exactly one survey.
      await request(http).post(apiPath(`/tickets/${ticketId}/reopen`)).set(auth).expect(200);
      await resolveTicket(ticketId);
      expect(await harness.prisma.csatResponse.count({ where: { ticketId } })).toBe(1);
    });

    it('sends no survey when satisfaction surveys are off', async () => {
      const ticket = await createTicket();
      await resolveTicket(ticket.body.data.id);
      const count = await harness.prisma.csatResponse.count({ where: { ticketId: ticket.body.data.id } });
      expect(count).toBe(0);
    });

    it('answers a survey by its token, rejects reuse, and the response shows in reports', async () => {
      const ticket = await createTicket();
      const ticketId = ticket.body.data.id;

      // Craft the row directly, exactly as scheduleSurvey does, so the test does not
      // depend on reading the queued email.
      const token = randomBytes(24).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await harness.prisma.csatResponse.create({
        data: {
          organizationId,
          ticketId,
          contactId,
          agentId,
          tokenHash,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });

      const loaded = await request(http).get(apiPath(`/csat/${token}`)).expect(200);
      expect(loaded.body.data.ticketNumber).toBe(ticket.body.data.ticketNumber);

      const submitted = await request(http)
        .post(apiPath(`/csat/${token}`))
        .send({ rating: 5, comment: 'Excellent, fast support.' })
        .expect(201);
      expect(submitted.body.data.rating).toBe(5);

      // Reusing the token a second time is refused.
      const reused = await request(http).post(apiPath(`/csat/${token}`)).send({ rating: 1 }).expect(400);
      expect(reused.body.error.code).toBe('VALIDATION_ERROR');

      const report = await request(http).get(apiPath('/reports/csat?range=30d')).set(auth).expect(200);
      expect(report.body.data.totals.responses).toBe(1);
      expect(report.body.data.totals.average).toBe(5);
      expect(report.body.data.comments).toHaveLength(1);
    });

    it('refuses an unknown or expired survey token', async () => {
      const missing = await request(http).get(apiPath('/csat/does-not-exist')).expect(404);
      expect(missing.body.error.code).toBe('SURVEY_NOT_FOUND');

      const token = randomBytes(24).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const ticket = await createTicket();
      await harness.prisma.csatResponse.create({
        data: {
          organizationId,
          ticketId: ticket.body.data.id,
          contactId,
          tokenHash,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const expired = await request(http).get(apiPath(`/csat/${token}`)).expect(400);
      expect(expired.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('keeps CSAT settings and survey data scoped to their own organization', async () => {
      await request(http)
        .patch(apiPath('/csat/settings'))
        .set(auth)
        .send({ isEnabled: true, subject: 'Rate us' })
        .expect(200);

      const other = await registerOrg(http, 'analytics-csat', 'owner@analytics-csat.example');
      const otherAuth = { Authorization: `Bearer ${other.token}` };
      const otherSettings = await request(http).get(apiPath('/csat/settings')).set(otherAuth).expect(200);
      expect(otherSettings.body.data.isEnabled).toBe(false);
      expect(otherSettings.body.data.subject).not.toBe('Rate us');
    });
  });
});
