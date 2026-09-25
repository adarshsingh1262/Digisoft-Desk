import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, TenantPrismaClient } from '@digisoft/db';
import type { AuthenticatedUser, AutomationRuleInput, ListAutomationRunsQuery } from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { pageMeta, toSkipTake } from '../common/dto/pagination';
import type { Paginated } from '../common/interceptors/response.interceptor';

const SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  position: true,
  trigger: true,
  conditions: true,
  actions: true,
  runCount: true,
  lastRunAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Automation rules and escalations (rules whose trigger is an SLA event). */
@Injectable()
export class AutomationRulesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list(escalationsOnly?: boolean) {
    return this.db.automationRule.findMany({
      where: escalationsOnly === undefined ? {} : { trigger: escalationsOnly ? { in: ['SLA_WARNING', 'SLA_BREACHED'] } : { notIn: ['SLA_WARNING', 'SLA_BREACHED'] } },
      select: SELECT,
      orderBy: [{ trigger: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string) {
    const rule = await this.db.automationRule.findUnique({ where: { id }, select: SELECT });
    if (!rule) throw AppError.notFound('automation rule');
    return rule;
  }

  async create(actor: AuthenticatedUser, input: AutomationRuleInput) {
    const rule = await this.db.automationRule.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive,
        position: input.position,
        trigger: input.trigger,
        conditions: JSON.parse(JSON.stringify(input.conditions)),
        actions: JSON.parse(JSON.stringify(input.actions)),
      },
      select: SELECT,
    });
    await this.record(actor, 'automation_rule.created', rule.id, undefined, rule);
    return rule;
  }

  async update(id: string, actor: AuthenticatedUser, input: Partial<AutomationRuleInput>) {
    const before = await this.findById(id);
    const rule = await this.db.automationRule.update({ where: { id }, data: this.toData(input), select: SELECT });
    await this.record(actor, 'automation_rule.updated', id, before, rule);
    return rule;
  }

  async setActive(id: string, actor: AuthenticatedUser, isActive: boolean) {
    await this.findById(id);
    const rule = await this.db.automationRule.update({ where: { id }, data: { isActive }, select: SELECT });
    await this.record(actor, isActive ? 'automation_rule.enabled' : 'automation_rule.disabled', id);
    return rule;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.findById(id);
    await this.db.automationRule.delete({ where: { id } });
    await this.record(actor, 'automation_rule.deleted', id);
  }

  async listRuns(query: ListAutomationRunsQuery): Promise<Paginated<unknown>> {
    const where: Prisma.AutomationRunWhereInput = {
      ...(query.ruleId ? { ruleId: query.ruleId } : {}),
      ...(query.ticketId ? { ticketId: query.ticketId } : {}),
      ...(query.matched !== undefined ? { matched: query.matched } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.automationRun.findMany({
        where,
        select: {
          id: true,
          trigger: true,
          matched: true,
          actionsApplied: true,
          error: true,
          createdAt: true,
          rule: { select: { id: true, name: true } },
          ticket: { select: { id: true, ticketNumber: true, subject: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.db.automationRun.count({ where }),
    ]);
    return { items, meta: pageMeta(query, total) };
  }

  private toData(input: Partial<AutomationRuleInput>) {
    const { conditions, actions, ...rest } = input;
    return {
      ...rest,
      ...(conditions ? { conditions: JSON.parse(JSON.stringify(conditions)) } : {}),
      ...(actions ? { actions: JSON.parse(JSON.stringify(actions)) } : {}),
    };
  }

  private record(actor: AuthenticatedUser, action: string, entityId: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.record({ organizationId: actor.organizationId, actorId: actor.id, action, entity: 'AutomationRule', entityId, oldValue, newValue });
  }
}
