import { Inject, Injectable } from '@nestjs/common';
import type { TenantPrismaClient } from '@digisoft/db';
import type { AuthenticatedUser, BlueprintInput } from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

const SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  position: true,
  conditions: true,
  createdAt: true,
  updatedAt: true,
  transitions: {
    select: {
      id: true,
      name: true,
      fromStatusId: true,
      toStatusId: true,
      requiredFields: true,
      allowedRoleIds: true,
      conditions: true,
      actions: true,
      position: true,
      fromStatus: { select: { id: true, name: true, color: true } },
      toStatus: { select: { id: true, name: true, color: true } },
    },
    orderBy: { position: 'asc' as const },
  },
} as const;

@Injectable()
export class BlueprintsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.blueprint.findMany({ select: SELECT, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  }

  async findById(id: string) {
    const blueprint = await this.db.blueprint.findUnique({ where: { id }, select: SELECT });
    if (!blueprint) throw AppError.notFound('blueprint');
    return blueprint;
  }

  async create(actor: AuthenticatedUser, input: BlueprintInput) {
    await this.assertReferences(input);
    const blueprint = await this.db.blueprint.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive,
        position: input.position,
        conditions: JSON.parse(JSON.stringify(input.conditions)),
        transitions: { create: input.transitions.map((transition, position) => this.transitionData(transition, position)) },
      },
      select: SELECT,
    });
    await this.record(actor, 'blueprint.created', blueprint.id, undefined, blueprint);
    return blueprint;
  }

  async update(id: string, actor: AuthenticatedUser, input: BlueprintInput) {
    const before = await this.findById(id);
    await this.assertReferences(input);
    const blueprint = await this.db.$transaction(async (tx) => {
      await tx.blueprintTransition.deleteMany({ where: { blueprintId: id } });
      return tx.blueprint.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description ?? null,
          isActive: input.isActive,
          position: input.position,
          conditions: JSON.parse(JSON.stringify(input.conditions)),
          transitions: { create: input.transitions.map((transition, position) => this.transitionData(transition, position)) },
        },
        select: SELECT,
      });
    });
    await this.record(actor, 'blueprint.updated', id, before, blueprint);
    return blueprint;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.findById(id);
    await this.db.blueprint.delete({ where: { id } });
    await this.record(actor, 'blueprint.deleted', id);
  }

  private transitionData(transition: BlueprintInput['transitions'][number], position: number) {
    return {
      name: transition.name,
      fromStatusId: transition.fromStatusId ?? null,
      toStatusId: transition.toStatusId,
      requiredFields: transition.requiredFields,
      allowedRoleIds: transition.allowedRoleIds,
      conditions: JSON.parse(JSON.stringify(transition.conditions)),
      actions: JSON.parse(JSON.stringify(transition.actions)),
      position: transition.position || position,
    };
  }

  private async assertReferences(input: BlueprintInput): Promise<void> {
    const statusIds = new Set<string>();
    for (const transition of input.transitions) {
      statusIds.add(transition.toStatusId);
      if (transition.fromStatusId) statusIds.add(transition.fromStatusId);
      if (transition.fromStatusId && transition.fromStatusId === transition.toStatusId) {
        throw AppError.validation(`Transition "${transition.name}" goes nowhere`);
      }
    }
    const found = await this.db.ticketStatus.count({ where: { id: { in: [...statusIds] } } });
    if (found !== statusIds.size) throw AppError.validation('One or more statuses do not exist in this organization');

    const roleIds = new Set(input.transitions.flatMap((transition) => transition.allowedRoleIds));
    if (roleIds.size > 0) {
      const roles = await this.db.role.count({ where: { id: { in: [...roleIds] } } });
      if (roles !== roleIds.size) throw AppError.validation('One or more roles do not exist in this organization');
    }
  }

  private record(actor: AuthenticatedUser, action: string, entityId: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.record({ organizationId: actor.organizationId, actorId: actor.id, action, entity: 'Blueprint', entityId, oldValue, newValue });
  }
}
