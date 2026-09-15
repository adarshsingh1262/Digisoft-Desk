import { Inject, Injectable } from '@nestjs/common';
import type { TenantPrismaClient } from '@digisoft/db';
import type {
  AuthenticatedUser,
  ReportDefinitionInput,
  UpdateReportDefinitionInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

const SELECT = {
  id: true,
  name: true,
  kind: true,
  description: true,
  filters: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** Saved filter sets, so a team looks at the same numbers every week. */
@Injectable()
export class ReportDefinitionsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.reportDefinition.findMany({ select: SELECT, orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const definition = await this.db.reportDefinition.findFirst({ where: { id }, select: SELECT });
    if (!definition) throw AppError.notFound('Report not found');
    return definition;
  }

  async create(actor: AuthenticatedUser, input: ReportDefinitionInput) {
    await this.assertNameFree(input.name);
    const definition = await this.db.reportDefinition.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        kind: input.kind,
        description: input.description ?? null,
        filters: input.filters,
        createdById: actor.id,
      },
      select: SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'report.created',
      entity: 'ReportDefinition',
      entityId: definition.id,
      newValue: { name: definition.name, kind: definition.kind },
    });
    return definition;
  }

  async update(actor: AuthenticatedUser, id: string, input: UpdateReportDefinitionInput) {
    const current = await this.get(id);
    if (input.name && input.name !== current.name) await this.assertNameFree(input.name);

    const definition = await this.db.reportDefinition.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.filters !== undefined ? { filters: input.filters } : {}),
      },
      select: SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'report.updated',
      entity: 'ReportDefinition',
      entityId: id,
      oldValue: { name: current.name, kind: current.kind },
      newValue: { name: definition.name, kind: definition.kind },
    });
    return definition;
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const current = await this.get(id);
    await this.db.reportDefinition.delete({ where: { id } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'report.deleted',
      entity: 'ReportDefinition',
      entityId: id,
      oldValue: { name: current.name },
    });
    return { id };
  }

  private async assertNameFree(name: string): Promise<void> {
    const existing = await this.db.reportDefinition.findFirst({ where: { name }, select: { id: true } });
    if (existing) throw AppError.conflict('A report with that name already exists');
  }
}
