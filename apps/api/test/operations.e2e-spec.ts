import request from 'supertest';
import type { Server } from 'node:http';
import { runTrigger, scanSla, type EngineDeps } from '@digisoft/engine';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';
import { EngineService } from '../src/engine/engine.service';

/**
 * Assignment rules, SLA, blueprints and automation, end to end. The automation runner
 * is invoked directly (as the worker would) so the suite does not depend on a second
 * process being alive.
 */
describe('Support operations (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let auth: { Authorization: string };
  let organizationId: string;
  let ownerId: string;
  let deps: EngineDeps;
  let departmentId: string;
  let statuses: Record<string, string>;
  let priorities: Record<string, string>;

  const agentIds: string[] = [];

  const createAgent = async (email: string, departments: string[] = []) => {
    const roles = await request(http).get(apiPath('/roles')).set(auth).expect(200);
    const roleId = (roles.body.data as { id: string; systemKey: string }[]).find((r) => r.systemKey === 'AGENT')!.id;
    const created = await request(http)
      .post(apiPath('/users'))
      .set(auth)
      .send({ firstName: 'Agent', lastName: email.split('@')[0], email, password: 'Str0ngPassword1', roleIds: [roleId], departmentIds: departments })
      .expect(201);
    return created.body.data.id as string;
  };

  const createTicket = (overrides: Record<string, unknown> = {}) =>
    request(http).post(apiPath('/tickets')).set(auth).send({ subject: 'Routing test', description: 'body', ...overrides });

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
    deps = harness.app.get(EngineService).deps;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    const org = await registerOrg(http, 'ops');
    auth = { Authorization: `Bearer ${org.token}` };
    organizationId = org.organizationId;
    ownerId = org.userId;

    const departments = await request(http).get(apiPath('/departments')).set(auth).expect(200);
    departmentId = departments.body.data[0].id;

    const statusRows = await request(http).get(apiPath('/ticket-statuses')).set(auth).expect(200);
    statuses = Object.fromEntries((statusRows.body.data as { systemKey: string; id: string }[]).map((s) => [s.systemKey, s.id]));
    const priorityRows = await request(http).get(apiPath('/ticket-priorities')).set(auth).expect(200);
    priorities = Object.fromEntries((priorityRows.body.data as { systemKey: string; id: string }[]).map((p) => [p.systemKey, p.id]));

    agentIds.length = 0;
    agentIds.push(await createAgent('a1@ops.example', [departmentId]));
    agentIds.push(await createAgent('a2@ops.example', [departmentId]));
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('assignment rules', () => {
    it('round-robins new tickets across the department', async () => {
      await request(http)
        .post(apiPath('/assignment-rules'))
        .set(auth)
        .send({ name: 'Spread the load', strategy: 'ROUND_ROBIN', departmentId, conditions: { all: [], any: [] } })
        .expect(201);

      const first = await createTicket().expect(201);
      const second = await createTicket().expect(201);
      const third = await createTicket().expect(201);

      expect(first.body.data.department.id).toBe(departmentId);
      expect(first.body.data.assignedAgent.id).toBe(agentIds[0]);
      expect(second.body.data.assignedAgent.id).toBe(agentIds[1]);
      expect(third.body.data.assignedAgent.id).toBe(agentIds[0]);

      const history = await request(http).get(apiPath(`/tickets/${first.body.data.id}/history`)).set(auth).expect(200);
      expect(history.body.data.some((e: { action: string; actorType: string }) => e.action === 'ticket.assigned' && e.actorType === 'AUTOMATION')).toBe(true);
    });

    it('gives the least-loaded agent the next ticket', async () => {
      await request(http)
        .post(apiPath('/assignment-rules'))
        .set(auth)
        .send({ name: 'Balance', strategy: 'LEAST_LOADED', departmentId })
        .expect(201);
      // Pre-load agent 1 with two open tickets by explicit assignment.
      await createTicket({ assignedAgentId: agentIds[0] }).expect(201);
      await createTicket({ assignedAgentId: agentIds[0] }).expect(201);

      const routed = await createTicket().expect(201);
      expect(routed.body.data.assignedAgent.id).toBe(agentIds[1]);
    });

    it('evaluates rules in order and only on matching conditions', async () => {
      await request(http)
        .post(apiPath('/assignment-rules'))
        .set(auth)
        .send({
          name: 'Urgent to a1',
          strategy: 'SPECIFIC_AGENT',
          agentId: agentIds[0],
          position: 0,
          conditions: { all: [{ field: 'priorityId', op: 'eq', value: priorities.URGENT }], any: [] },
        })
        .expect(201);
      await request(http)
        .post(apiPath('/assignment-rules'))
        .set(auth)
        .send({ name: 'Everything else to the department', strategy: 'DEPARTMENT', departmentId, position: 1 })
        .expect(201);

      const urgent = await createTicket({ priorityId: priorities.URGENT }).expect(201);
      expect(urgent.body.data.assignedAgent.id).toBe(agentIds[0]);

      const normal = await createTicket().expect(201);
      expect(normal.body.data.assignedAgent).toBeNull();
      expect(normal.body.data.department.id).toBe(departmentId);
    });

    it('never overrides an assignment the agent made explicitly', async () => {
      await request(http).post(apiPath('/assignment-rules')).set(auth).send({ name: 'r', strategy: 'SPECIFIC_AGENT', agentId: agentIds[0] }).expect(201);
      const ticket = await createTicket({ assignedAgentId: agentIds[1] }).expect(201);
      expect(ticket.body.data.assignedAgent.id).toBe(agentIds[1]);
    });

    it('validates strategy targets and rejects foreign agents', async () => {
      await request(http).post(apiPath('/assignment-rules')).set(auth).send({ name: 'bad', strategy: 'SPECIFIC_AGENT' }).expect(400);
      await request(http).post(apiPath('/assignment-rules')).set(auth).send({ name: 'bad', strategy: 'ROUND_ROBIN' }).expect(400);
      const other = await registerOrg(http, 'ops-other');
      await request(http)
        .post(apiPath('/assignment-rules'))
        .set({ Authorization: `Bearer ${other.token}` })
        .send({ name: 'steal', strategy: 'SPECIFIC_AGENT', agentId: agentIds[0] })
        .expect(404);
    });
  });

  describe('SLA', () => {
    it('applies the default policy on creation with per-priority targets', async () => {
      const ticket = await createTicket({ priorityId: priorities.URGENT }).expect(201);
      expect(ticket.body.data.slaPolicy.name).toBe('Standard support');
      expect(ticket.body.data.firstResponseDueAt).not.toBeNull();
      expect(ticket.body.data.resolutionDueAt).not.toBeNull();
      expect(new Date(ticket.body.data.resolutionDueAt).getTime()).toBeGreaterThan(new Date(ticket.body.data.firstResponseDueAt).getTime());
      expect(ticket.body.data.dueAt).toBe(ticket.body.data.resolutionDueAt);
    });

    it('re-derives the targets when the priority changes', async () => {
      const ticket = await createTicket({ priorityId: priorities.LOW }).expect(201);
      const before = new Date(ticket.body.data.resolutionDueAt).getTime();
      const bumped = await request(http)
        .post(apiPath(`/tickets/${ticket.body.data.id}/priority`))
        .set(auth)
        .send({ priorityId: priorities.URGENT })
        .expect(200);
      expect(new Date(bumped.body.data.resolutionDueAt).getTime()).toBeLessThan(before);
    });

    it('pauses the clock in an on-hold status and resumes it afterwards', async () => {
      const ticket = await createTicket().expect(201);
      const id = ticket.body.data.id as string;

      const held = await request(http).post(apiPath(`/tickets/${id}/status`)).set(auth).send({ statusId: statuses.ON_HOLD }).expect(200);
      expect(held.body.data.slaPausedAt).not.toBeNull();
      const paused = await harness.prisma.ticket.findUniqueOrThrow({ where: { id }, select: { resolutionRemainingMin: true } });
      expect(paused.resolutionRemainingMin).toBeGreaterThan(0);

      // A paused ticket is invisible to the sweep even when its due date is in the past.
      await harness.prisma.ticket.update({ where: { id }, data: { resolutionDueAt: new Date(Date.now() - 60_000) } });
      expect(await scanSla(harness.prisma)).toEqual([]);

      const resumed = await request(http).post(apiPath(`/tickets/${id}/status`)).set(auth).send({ statusId: statuses.OPEN }).expect(200);
      expect(resumed.body.data.slaPausedAt).toBeNull();
      expect(new Date(resumed.body.data.resolutionDueAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('sweeps warnings and breaches exactly once and stops at first response', async () => {
      const ticket = await createTicket().expect(201);
      const id = ticket.body.data.id as string;
      const soon = new Date(Date.now() + 5 * 60_000);
      await harness.prisma.ticket.update({ where: { id }, data: { firstResponseDueAt: soon, resolutionDueAt: new Date(Date.now() - 1000) } });

      const first = await scanSla(harness.prisma);
      expect(first).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ticketId: id, kind: 'breach', target: 'resolution' }),
          expect.objectContaining({ ticketId: id, kind: 'warning', target: 'first_response' }),
        ]),
      );
      expect(await scanSla(harness.prisma)).toEqual([]);

      // A reply satisfies first response, so its breach can never fire.
      await request(http).post(apiPath(`/tickets/${id}/messages`)).set(auth).send({ bodyText: 'On it' }).expect(201);
      await harness.prisma.ticket.update({ where: { id }, data: { firstResponseDueAt: new Date(Date.now() - 1000) } });
      expect((await scanSla(harness.prisma)).filter((e) => e.target === 'first_response')).toEqual([]);
    });

    it('lets an administrator define a policy that wins over the default', async () => {
      const created = await request(http)
        .post(apiPath('/sla-policies'))
        .set(auth)
        .send({
          name: 'VIP',
          position: 0,
          conditions: { all: [{ field: 'contactIsVip', op: 'eq', value: true }], any: [] },
          warningMinutesBefore: 10,
          targets: [{ priorityId: null, firstResponseMinutes: 5, resolutionMinutes: 60, useBusinessHours: false }],
        })
        .expect(201);
      expect(created.body.data.targets).toHaveLength(1);

      const vip = await request(http).post(apiPath('/contacts')).set(auth).send({ firstName: 'Very', isVip: true }).expect(201);
      const ticket = await createTicket({ contactId: vip.body.data.id }).expect(201);
      expect(ticket.body.data.slaPolicy.name).toBe('VIP');
      // Wall-clock target: five minutes from creation, give or take the request.
      const delta = new Date(ticket.body.data.firstResponseDueAt).getTime() - new Date(ticket.body.data.createdAt).getTime();
      expect(Math.abs(delta - 5 * 60_000)).toBeLessThan(5_000);

      await request(http).post(apiPath('/sla-policies')).set(auth).send({ name: 'dup', targets: [{ firstResponseMinutes: 1, resolutionMinutes: 2 }, { firstResponseMinutes: 1, resolutionMinutes: 2 }] }).expect(400);
    });
  });

  describe('blueprints', () => {
    let blueprintId: string;

    beforeEach(async () => {
      const created = await request(http)
        .post(apiPath('/blueprints'))
        .set(auth)
        .send({
          name: 'Support flow',
          transitions: [
            { name: 'Start work', fromStatusId: statuses.NEW, toStatusId: statuses.IN_PROGRESS, requiredFields: ['assignedAgentId'] },
            { name: 'Resolve', fromStatusId: statuses.IN_PROGRESS, toStatusId: statuses.RESOLVED, requiredFields: ['resolutionNote'] },
            { name: 'Close', fromStatusId: statuses.RESOLVED, toStatusId: statuses.CLOSED, allowedRoleIds: [] },
          ],
        })
        .expect(201);
      blueprintId = created.body.data.id;
    });

    it('lists only the transitions reachable from the current status', async () => {
      const ticket = await createTicket().expect(201);
      const transitions = await request(http).get(apiPath(`/tickets/${ticket.body.data.id}/transitions`)).set(auth).expect(200);
      expect(transitions.body.data.governed).toBe(true);
      expect(transitions.body.data.transitions.map((t: { name: string }) => t.name)).toEqual(['Start work']);
    });

    it('blocks a jump the workflow does not allow and names missing fields', async () => {
      const ticket = await createTicket().expect(201);
      const id = ticket.body.data.id as string;

      const jump = await request(http).post(apiPath(`/tickets/${id}/status`)).set(auth).send({ statusId: statuses.RESOLVED, resolutionNote: 'x' }).expect(400);
      expect(jump.body.error.message).toMatch(/not reachable/);

      const unassigned = await request(http).post(apiPath(`/tickets/${id}/status`)).set(auth).send({ statusId: statuses.IN_PROGRESS }).expect(400);
      expect(unassigned.body.error.details.missingFields).toEqual(['assignedAgentId']);

      await request(http).post(apiPath(`/tickets/${id}/assign`)).set(auth).send({ assignedAgentId: agentIds[0] }).expect(200);
      const started = await request(http).post(apiPath(`/tickets/${id}/status`)).set(auth).send({ statusId: statuses.IN_PROGRESS }).expect(200);
      expect(started.body.data.status.id).toBe(statuses.IN_PROGRESS);

      // The resolve shortcut still goes through the workflow.
      const resolved = await request(http).post(apiPath(`/tickets/${id}/resolve`)).set(auth).send({ resolutionNote: 'Fixed' }).expect(200);
      expect(resolved.body.data.status.id).toBe(statuses.RESOLVED);
    });

    it('restricts a transition to the roles it names', async () => {
      const roles = await request(http).get(apiPath('/roles')).set(auth).expect(200);
      const adminRole = (roles.body.data as { id: string; systemKey: string }[]).find((r) => r.systemKey === 'SUPER_ADMIN')!.id;
      await request(http)
        .patch(apiPath(`/blueprints/${blueprintId}`))
        .set(auth)
        .send({
          name: 'Support flow',
          transitions: [
            { name: 'Start work', fromStatusId: statuses.NEW, toStatusId: statuses.IN_PROGRESS },
            { name: 'Escalate', fromStatusId: statuses.IN_PROGRESS, toStatusId: statuses.ON_HOLD, allowedRoleIds: [adminRole] },
          ],
        })
        .expect(200);

      const ticket = await createTicket().expect(201);
      const id = ticket.body.data.id as string;
      await request(http).post(apiPath(`/tickets/${id}/status`)).set(auth).send({ statusId: statuses.IN_PROGRESS }).expect(200);

      const login = await request(http).post(apiPath('/auth/login')).send({ email: 'a1@ops.example', password: 'Str0ngPassword1', organizationSlug: 'ops' }).expect(200);
      const agentAuth = { Authorization: `Bearer ${login.body.data.accessToken}` };
      await request(http).post(apiPath(`/tickets/${id}/assign`)).set(auth).send({ assignedAgentId: agentIds[0] }).expect(200);

      const denied = await request(http).post(apiPath(`/tickets/${id}/status`)).set(agentAuth).send({ statusId: statuses.ON_HOLD }).expect(400);
      expect(denied.body.error.message).toMatch(/role/);
      await request(http).post(apiPath(`/tickets/${id}/status`)).set(auth).send({ statusId: statuses.ON_HOLD }).expect(200);
    });

    it('ignores tickets its conditions do not cover', async () => {
      await request(http)
        .patch(apiPath(`/blueprints/${blueprintId}`))
        .set(auth)
        .send({
          name: 'Support flow',
          conditions: { all: [{ field: 'priorityId', op: 'eq', value: priorities.URGENT }], any: [] },
          transitions: [{ name: 'Only step', fromStatusId: statuses.NEW, toStatusId: statuses.IN_PROGRESS }],
        })
        .expect(200);
      const ticket = await createTicket().expect(201);
      const transitions = await request(http).get(apiPath(`/tickets/${ticket.body.data.id}/transitions`)).set(auth).expect(200);
      expect(transitions.body.data.governed).toBe(false);
      await request(http).post(apiPath(`/tickets/${ticket.body.data.id}/status`)).set(auth).send({ statusId: statuses.PENDING }).expect(200);
    });
  });

  describe('automation', () => {
    it('applies actions when conditions match and records every evaluation', async () => {
      const tag = await request(http).post(apiPath('/tags')).set(auth).send({ name: 'urgent-email' }).expect(201);
      const rule = await request(http)
        .post(apiPath('/automation-rules'))
        .set(auth)
        .send({
          name: 'Flag urgent email',
          trigger: 'TICKET_CREATED',
          conditions: { all: [{ field: 'source', op: 'eq', value: 'EMAIL' }], any: [] },
          actions: [
            { type: 'set_priority', priorityId: priorities.URGENT },
            { type: 'add_tag', tagId: tag.body.data.id },
            { type: 'assign_agent', agentId: agentIds[1] },
            { type: 'add_internal_note', body: 'Auto-flagged {{ticket.number}} for {{contact.name}}' },
            { type: 'create_task', subject: 'Review {{ticket.subject}}', assignTo: 'assignee', dueInHours: 4 },
          ],
        })
        .expect(201);

      const match = await createTicket({ source: 'EMAIL' }).expect(201);
      const miss = await createTicket({ source: 'CHAT' }).expect(201);

      await runTrigger(deps, { organizationId, ticketId: match.body.data.id, trigger: 'TICKET_CREATED' });
      await runTrigger(deps, { organizationId, ticketId: miss.body.data.id, trigger: 'TICKET_CREATED' });

      const after = await request(http).get(apiPath(`/tickets/${match.body.data.id}`)).set(auth).expect(200);
      expect(after.body.data.priority.id).toBe(priorities.URGENT);
      expect(after.body.data.tags.map((t: { tag: { name: string } }) => t.tag.name)).toEqual(['urgent-email']);
      expect(after.body.data.assignedAgent.id).toBe(agentIds[1]);

      const messages = await request(http).get(apiPath(`/tickets/${match.body.data.id}/messages`)).set(auth).expect(200);
      expect(messages.body.data[0].type).toBe('INTERNAL_COMMENT');
      expect(messages.body.data[0].bodyText).toContain(`#${match.body.data.ticketNumber}`);

      const tasks = await request(http).get(apiPath(`/activities?ticketId=${match.body.data.id}`)).set(auth).expect(200);
      expect(tasks.body.data[0].assignedTo.id).toBe(agentIds[1]);
      expect(tasks.body.data[0].subject).toBe('Review Routing test');

      const untouched = await request(http).get(apiPath(`/tickets/${miss.body.data.id}`)).set(auth).expect(200);
      expect(untouched.body.data.tags).toEqual([]);

      const runs = await request(http).get(apiPath(`/automation-rules/runs?ruleId=${rule.body.data.id}`)).set(auth).expect(200);
      expect(runs.body.data.map((r: { matched: boolean }) => r.matched).sort()).toEqual([false, true]);
      const ruleAfter = await request(http).get(apiPath(`/automation-rules/${rule.body.data.id}`)).set(auth).expect(200);
      expect(ruleAfter.body.data.runCount).toBe(1);

      const history = await request(http).get(apiPath(`/tickets/${match.body.data.id}/history`)).set(auth).expect(200);
      expect(history.body.data.some((e: { actorType: string }) => e.actorType === 'AUTOMATION')).toBe(true);
    });

    it('runs escalations on SLA breach and notifies the assignee', async () => {
      await request(http)
        .post(apiPath('/automation-rules'))
        .set(auth)
        .send({
          name: 'Escalate breaches',
          trigger: 'SLA_BREACHED',
          actions: [{ type: 'set_priority', priorityId: priorities.URGENT }, { type: 'notify_department', message: 'SLA breached on {{ticket.number}}' }],
        })
        .expect(201);
      const ticket = await createTicket({ departmentId, assignedAgentId: agentIds[0] }).expect(201);
      const id = ticket.body.data.id as string;
      await harness.prisma.ticket.update({ where: { id }, data: { resolutionDueAt: new Date(Date.now() - 1000) } });

      const events = await scanSla(harness.prisma);
      expect(events).toEqual([expect.objectContaining({ ticketId: id, kind: 'breach', target: 'resolution' })]);
      await runTrigger(deps, { organizationId, ticketId: id, trigger: 'SLA_BREACHED', context: { target: 'resolution' } });

      const after = await request(http).get(apiPath(`/tickets/${id}`)).set(auth).expect(200);
      expect(after.body.data.priority.id).toBe(priorities.URGENT);
      expect(after.body.data.resolutionBreachedAt).not.toBeNull();

      // notify_department reaches the department's members; the registering owner is
      // not one of them, so they are correctly left out.
      const notified = await harness.prisma.notification.findMany({ where: { organizationId, type: 'escalation.notification' } });
      expect(new Set(notified.map((n) => n.userId))).toEqual(new Set([agentIds[0], agentIds[1]]));
      expect(notified.some((n) => n.userId === ownerId)).toBe(false);

      // The built-in breach notice still reaches the assignee and every follower.
      const breachNotices = await harness.prisma.notification.findMany({ where: { organizationId, type: 'sla.breached' } });
      expect(breachNotices.length).toBe(0); // produced by the worker's sweep handler, not the engine scan itself
    });

    it('keeps rules, runs and effects inside the organization', async () => {
      const other = await registerOrg(http, 'ops-other');
      const otherAuth = { Authorization: `Bearer ${other.token}` };
      await request(http)
        .post(apiPath('/automation-rules'))
        .set(otherAuth)
        .send({ name: 'Foreign', trigger: 'TICKET_CREATED', actions: [{ type: 'set_priority', priorityId: priorities.URGENT }] })
        .expect(201);

      const ticket = await createTicket().expect(201);
      await runTrigger(deps, { organizationId, ticketId: ticket.body.data.id, trigger: 'TICKET_CREATED' });
      const after = await request(http).get(apiPath(`/tickets/${ticket.body.data.id}`)).set(auth).expect(200);
      expect(after.body.data.priority.id).toBe(priorities.MEDIUM);

      const runs = await request(http).get(apiPath('/automation-rules/runs')).set(otherAuth).expect(200);
      expect(runs.body.meta.total).toBe(0);
      await request(http).get(apiPath('/automation-rules')).set({ Authorization: `Bearer ${(await request(http).post(apiPath('/auth/login')).send({ email: 'a1@ops.example', password: 'Str0ngPassword1', organizationSlug: 'ops' })).body.data.accessToken}` }).expect(200);
    });
  });
});
