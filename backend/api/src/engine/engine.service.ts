import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { AuthenticatedUser, AutomationTrigger } from '@digisoft/shared';
import {
  AUTOMATION_JOB,
  applyActions,
  applySla,
  checkTransition,
  decideAssignment,
  findBlueprint,
  loadTicket,
  pauseSla,
  resumeSla,
  toFacts,
  transitionsFrom,
  type EngineDeps,
  type TransitionCheck,
  type TransitionOption,
  type TriggerJob,
} from '@digisoft/engine';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AUTOMATION_QUEUE_TOKEN, EMAIL_QUEUE } from '../queue/queue.module';

/**
 * The API's handle on the shared engine. Synchronous pieces (assignment, SLA apply,
 * blueprint checks) run in the request so the caller sees their effect; automation
 * triggers are queued for the worker so a slow rule never delays a response.
 */
@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);
  readonly deps: EngineDeps;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) redis: Redis,
    @Inject(EMAIL_QUEUE) emailQueue: Queue,
    @Inject(AUTOMATION_QUEUE_TOKEN) private readonly automationQueue: Queue<TriggerJob>,
  ) {
    this.deps = {
      prisma,
      redis,
      emailQueue,
      log: (level, message, meta) => {
        const line = meta ? `${message} ${JSON.stringify(meta)}` : message;
        if (level === 'error') this.logger.error(line);
        else if (level === 'warn') this.logger.warn(line);
        else this.logger.log(line);
      },
    };
  }

  async trigger(organizationId: string, ticketId: string, trigger: AutomationTrigger, context?: Record<string, unknown>) {
    await this.automationQueue.add(
      AUTOMATION_JOB,
      { organizationId, ticketId, trigger, context },
      // One job per ticket/trigger/second: a burst of edits collapses rather than storming
      // rules. BullMQ forbids ':' in custom ids, hence the hyphens.
      { jobId: `${organizationId}-${ticketId}-${trigger}-${Math.floor(Date.now() / 1000)}` },
    );
  }

  /** Routes a freshly created ticket. Returns what changed, or null when no rule matched. */
  async routeNewTicket(organizationId: string, ticketId: string) {
    const ticket = await loadTicket(this.prisma, organizationId, ticketId);
    if (!ticket) return null;
    const decision = await decideAssignment(this.prisma, organizationId, toFacts(ticket));
    if (!decision) return null;

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...(decision.assignedAgentId ? { assignedAgentId: decision.assignedAgentId } : {}),
        ...(decision.departmentId ? { departmentId: decision.departmentId } : {}),
      },
    });
    if (decision.assignedAgentId) {
      await this.prisma.ticketFollower.upsert({
        where: { ticketId_userId: { ticketId, userId: decision.assignedAgentId } },
        create: { ticketId, userId: decision.assignedAgentId },
        update: {},
      });
    }
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorType: 'AUTOMATION',
        action: 'ticket.assigned',
        entity: 'Ticket',
        entityId: ticketId,
        newValue: { assignedAgentId: decision.assignedAgentId, departmentId: decision.departmentId, by: `assignment-rule:${decision.ruleName}` },
      },
    });
    return decision;
  }

  async applySlaToTicket(organizationId: string, ticketId: string) {
    const ticket = await loadTicket(this.prisma, organizationId, ticketId);
    if (!ticket) return null;
    return applySla(this.prisma, organizationId, ticketId, toFacts(ticket), ticket.createdAt);
  }

  /** Called on every status change; starts or stops the clock as the new status dictates. */
  async syncSlaPause(organizationId: string, ticketId: string, pausesSla: boolean) {
    if (pausesSla) await pauseSla(this.prisma, organizationId, ticketId);
    else await resumeSla(this.prisma, organizationId, ticketId);
  }

  /** Blueprint transitions available to this actor from the ticket's current status. */
  async transitionsFor(organizationId: string, ticketId: string, actor: AuthenticatedUser) {
    const ticket = await loadTicket(this.prisma, organizationId, ticketId);
    if (!ticket) return { governed: false, transitions: [] as TransitionOption[] };
    const blueprint = await findBlueprint(this.prisma, organizationId, toFacts(ticket));
    if (!blueprint) return { governed: false, transitions: [] as TransitionOption[] };
    const roleIds = await this.roleIdsFor(actor);
    const options = transitionsFrom(blueprint, toFacts(ticket)).filter(
      (option) => option.allowedRoleIds.length === 0 || option.allowedRoleIds.some((roleId) => roleIds.includes(roleId)),
    );
    return { governed: true, blueprint: { id: blueprint.id, name: blueprint.name }, transitions: options };
  }

  /** Validates a status change against the governing blueprint, if any. */
  async checkStatusChange(
    organizationId: string,
    ticketId: string,
    toStatusId: string,
    actor: AuthenticatedUser,
    supplied: { resolutionNote?: string | null },
  ): Promise<TransitionCheck & { governed: boolean }> {
    const ticket = await loadTicket(this.prisma, organizationId, ticketId);
    if (!ticket) return { ok: false, governed: false, reason: 'ticket not found' };
    const blueprint = await findBlueprint(this.prisma, organizationId, toFacts(ticket));
    if (!blueprint) return { ok: true, governed: false };
    const roleIds = await this.roleIdsFor(actor);
    return { governed: true, ...checkTransition(transitionsFrom(blueprint, toFacts(ticket)), ticket, toStatusId, roleIds, supplied) };
  }

  /** Runs a transition's follow-up actions after the status has been written. */
  async runTransitionActions(organizationId: string, ticketId: string, transition: TransitionOption) {
    if (transition.actions.length === 0) return;
    await applyActions(this.deps, organizationId, ticketId, transition.actions, {
      kind: 'blueprint',
      id: transition.transitionId,
      name: transition.name,
    });
  }

  private async roleIdsFor(actor: AuthenticatedUser): Promise<string[]> {
    const links = await this.prisma.userRole.findMany({ where: { userId: actor.id }, select: { roleId: true } });
    return links.map((link) => link.roleId);
  }
}
