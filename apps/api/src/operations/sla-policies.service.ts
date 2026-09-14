import { Inject, Injectable } from '@nestjs/common';
import type { TenantPrismaClient } from '@digisoft/db';
import type { AuthenticatedUser, SlaPolicyInput } from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

const SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  isDefault: true,
  position: true,
  conditions: true,
  businessHoursId: true,
  warningMinutesBefore: true,
  createdAt: true,
  updatedAt: true,
  businessHours: { select: { id: true, name: true, timezone: true } },
  targets: {
    select: { id: true, priorityId: true, firstResponseMinutes: true, resolutionMinutes: true, useBusinessHours: true, priority: { select: { id: true, name: true } } },
  },
  _count: { select: { tickets: true } },
} as const;

@Injectable()
export class SlaPoliciesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.slaPolicy.findMany({ select: SELECT, orderBy: [{ isDefault: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }] });
  }

  async findById(id: string) {
    const policy = await this.db.slaPolicy.findUnique({ where: { id }, select: SELECT });
    if (!policy) throw AppError.notFound('sla policy');
    return policy;
  }

  async create(actor: AuthenticatedUser, input: SlaPolicyInput) {
    await this.assertReferences(input);
    const policy = await this.db.$transaction(async (tx) => {
      if (input.isDefault) await tx.slaPolicy.updateMany({ where: {}, data: { isDefault: false } });
      return tx.slaPolicy.create({
        data: {
          organizationId: actor.organizationId,
          name: input.name,
          description: input.description ?? null,
          isActive: input.isActive,
          isDefault: input.isDefault,
          position: input.position,
          conditions: JSON.parse(JSON.stringify(input.conditions)),
          businessHoursId: input.businessHoursId ?? null,
          warningMinutesBefore: input.warningMinutesBefore,
          targets: { create: input.targets.map((target) => ({ ...target, priorityId: target.priorityId ?? null })) },
        },
        select: SELECT,
      });
    });
    await this.record(actor, 'sla_policy.created', policy.id, undefined, policy);
    return policy;
  }

  async update(id: string, actor: AuthenticatedUser, input: SlaPolicyInput) {
    const before = await this.findById(id);
    await this.assertReferences(input);
    const policy = await this.db.$transaction(async (tx) => {
      if (input.isDefault) await tx.slaPolicy.updateMany({ where: {}, data: { isDefault: false } });
      await tx.slaTarget.deleteMany({ where: { slaPolicyId: id } });
      return tx.slaPolicy.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description ?? null,
          isActive: input.isActive,
          isDefault: input.isDefault,
          position: input.position,
          conditions: JSON.parse(JSON.stringify(input.conditions)),
          businessHoursId: input.businessHoursId ?? null,
          warningMinutesBefore: input.warningMinutesBefore,
          targets: { create: input.targets.map((target) => ({ ...target, priorityId: target.priorityId ?? null })) },
        },
        select: SELECT,
      });
    });
    await this.record(actor, 'sla_policy.updated', id, before, policy);
    return policy;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const policy = await this.findById(id);
    if (policy.isDefault) throw AppError.validation('Make another policy the default before deleting this one');
    await this.db.slaPolicy.delete({ where: { id } });
    await this.record(actor, 'sla_policy.deleted', id);
  }

  private async assertReferences(input: SlaPolicyInput): Promise<void> {
    if (input.businessHoursId) {
      const found = await this.db.businessHours.findUnique({ where: { id: input.businessHoursId }, select: { id: true } });
      if (!found) throw AppError.notFound('business hours');
    }
    const priorityIds = input.targets.map((target) => target.priorityId).filter((id): id is string => Boolean(id));
    if (priorityIds.length > 0) {
      const found = await this.db.ticketPriority.count({ where: { id: { in: priorityIds } } });
      if (found !== new Set(priorityIds).size) throw AppError.validation('One or more priorities do not exist');
    }
    if (new Set(input.targets.map((target) => target.priorityId ?? null)).size !== input.targets.length) {
      throw AppError.validation('Each priority may appear once per policy');
    }
  }

  private record(actor: AuthenticatedUser, action: string, entityId: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.record({ organizationId: actor.organizationId, actorId: actor.id, action, entity: 'SlaPolicy', entityId, oldValue, newValue });
  }
}
