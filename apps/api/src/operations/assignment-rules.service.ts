import { Inject, Injectable } from '@nestjs/common';
import type { TenantPrismaClient } from '@digisoft/db';
import type { AssignmentRuleInput, AuthenticatedUser } from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

const SELECT = {
  id: true,
  name: true,
  isActive: true,
  position: true,
  conditions: true,
  strategy: true,
  departmentId: true,
  teamId: true,
  agentId: true,
  lastAssignedUserId: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  agent: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class AssignmentRulesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.assignmentRule.findMany({ select: SELECT, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  }

  async findById(id: string) {
    const rule = await this.db.assignmentRule.findUnique({ where: { id }, select: SELECT });
    if (!rule) throw AppError.notFound('assignment rule');
    return rule;
  }

  async create(actor: AuthenticatedUser, input: AssignmentRuleInput) {
    await this.assertTargets(input);
    const rule = await this.db.assignmentRule.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        isActive: input.isActive,
        position: input.position,
        strategy: input.strategy,
        departmentId: input.departmentId ?? null,
        teamId: input.teamId ?? null,
        agentId: input.agentId ?? null,
        conditions: JSON.parse(JSON.stringify(input.conditions)),
      },
      select: SELECT,
    });
    await this.record(actor, 'assignment_rule.created', rule.id, undefined, rule);
    return rule;
  }

  async update(id: string, actor: AuthenticatedUser, input: Partial<AssignmentRuleInput>) {
    const before = await this.findById(id);
    await this.assertTargets(input);
    const merged = { ...before, ...input };
    if (merged.strategy === 'SPECIFIC_AGENT' && !merged.agentId) {
      throw AppError.validation('Choose the agent to assign');
    }
    if (merged.strategy !== 'SPECIFIC_AGENT' && !merged.departmentId && !merged.teamId) {
      throw AppError.validation('Choose a department or team to route to');
    }
    const rule = await this.db.assignmentRule.update({ where: { id }, data: this.toData(input), select: SELECT });
    await this.record(actor, 'assignment_rule.updated', id, before, rule);
    return rule;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.findById(id);
    await this.db.assignmentRule.delete({ where: { id } });
    await this.record(actor, 'assignment_rule.deleted', id);
  }

  /** Persists a new evaluation order from a full list of ids. */
  async reorder(actor: AuthenticatedUser, ids: string[]): Promise<void> {
    const existing = await this.db.assignmentRule.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (existing.length !== new Set(ids).size) throw AppError.validation('One or more rules do not exist');
    await this.db.$transaction(
      ids.map((id, position) => this.db.assignmentRule.update({ where: { id }, data: { position } })),
    );
    await this.record(actor, 'assignment_rule.reordered', 'all', undefined, { ids });
  }

  private toData(input: Partial<AssignmentRuleInput>) {
    const { conditions, ...rest } = input;
    return { ...rest, ...(conditions ? { conditions: JSON.parse(JSON.stringify(conditions)) } : {}) };
  }

  private async assertTargets(input: Partial<AssignmentRuleInput>): Promise<void> {
    if (input.departmentId) {
      const found = await this.db.department.findUnique({ where: { id: input.departmentId }, select: { id: true } });
      if (!found) throw AppError.notFound('department');
    }
    if (input.teamId) {
      const found = await this.db.team.findUnique({ where: { id: input.teamId }, select: { id: true } });
      if (!found) throw AppError.notFound('team');
    }
    if (input.agentId) {
      const found = await this.db.user.findFirst({ where: { id: input.agentId, type: 'AGENT', isActive: true }, select: { id: true } });
      if (!found) throw AppError.notFound('agent');
    }
  }

  private record(actor: AuthenticatedUser, action: string, entityId: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.record({ organizationId: actor.organizationId, actorId: actor.id, action, entity: 'AssignmentRule', entityId, oldValue, newValue });
  }
}
