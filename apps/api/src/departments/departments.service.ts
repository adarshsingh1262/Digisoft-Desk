import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  CreateDepartmentInput,
  CreateTeamInput,
  UpdateDepartmentInput,
  UpdateTeamInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import type { TenantPrismaClient } from '@digisoft/db';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

const DEPARTMENT_FIELDS = {
  id: true,
  name: true,
  description: true,
  email: true,
  isDefault: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true, teams: true } },
} as const;

const TEAM_FIELDS = {
  id: true,
  name: true,
  description: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } },
  members: {
    select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  },
} as const;

@Injectable()
export class DepartmentsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.department.findMany({
      select: DEPARTMENT_FIELDS,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findById(id: string) {
    const department = await this.db.department.findUnique({
      where: { id },
      select: {
        ...DEPARTMENT_FIELDS,
        members: {
          select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });
    if (!department) {
      throw AppError.notFound('department');
    }
    return department;
  }

  async create(actor: AuthenticatedUser, input: CreateDepartmentInput) {
    await this.assertParentExists(input.parentId);

    const department = await this.db.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.department.updateMany({ where: {}, data: { isDefault: false } });
      }
      return tx.department.create({
        data: {
          organizationId: actor.organizationId,
          name: input.name,
          description: input.description ?? null,
          email: input.email ?? null,
          parentId: input.parentId ?? null,
          isDefault: input.isDefault ?? false,
        },
        select: DEPARTMENT_FIELDS,
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'department.created',
      entity: 'Department',
      entityId: department.id,
      newValue: department,
    });
    return department;
  }

  async update(id: string, actor: AuthenticatedUser, input: UpdateDepartmentInput) {
    const before = await this.findById(id);
    if (input.parentId) {
      if (input.parentId === id) {
        throw AppError.validation('A department cannot be its own parent');
      }
      await this.assertParentExists(input.parentId);
    }

    const department = await this.db.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.department.updateMany({ where: {}, data: { isDefault: false } });
      }
      return tx.department.update({ where: { id }, data: input, select: DEPARTMENT_FIELDS });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'department.updated',
      entity: 'Department',
      entityId: id,
      oldValue: before,
      newValue: department,
    });
    return department;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const department = await this.findById(id);
    if (department.isDefault) {
      throw AppError.validation('Set another department as default before deleting this one');
    }
    await this.db.department.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'department.deleted',
      entity: 'Department',
      entityId: id,
    });
  }

  listTeams() {
    return this.db.team.findMany({ select: TEAM_FIELDS, orderBy: { name: 'asc' } });
  }

  async findTeamById(id: string) {
    const team = await this.db.team.findUnique({ where: { id }, select: TEAM_FIELDS });
    if (!team) {
      throw AppError.notFound('team');
    }
    return team;
  }

  async createTeam(actor: AuthenticatedUser, input: CreateTeamInput) {
    await this.assertParentExists(input.departmentId);
    await this.assertMembersExist(input.memberIds);

    const team = await this.db.team.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        description: input.description ?? null,
        departmentId: input.departmentId ?? null,
        members: { create: input.memberIds.map((userId) => ({ userId })) },
      },
      select: TEAM_FIELDS,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'team.created',
      entity: 'Team',
      entityId: team.id,
      newValue: team,
    });
    return team;
  }

  async updateTeam(id: string, actor: AuthenticatedUser, input: UpdateTeamInput) {
    const before = await this.findTeamById(id);
    if (input.departmentId) {
      await this.assertParentExists(input.departmentId);
    }
    if (input.memberIds) {
      await this.assertMembersExist(input.memberIds);
    }

    const team = await this.db.$transaction(async (tx) => {
      if (input.memberIds) {
        await tx.teamMember.deleteMany({ where: { teamId: id } });
        if (input.memberIds.length > 0) {
          await tx.teamMember.createMany({
            data: input.memberIds.map((userId) => ({ teamId: id, userId })),
          });
        }
      }
      return tx.team.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        },
        select: TEAM_FIELDS,
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'team.updated',
      entity: 'Team',
      entityId: id,
      oldValue: before,
      newValue: team,
    });
    return team;
  }

  async removeTeam(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.findTeamById(id);
    await this.db.team.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'team.deleted',
      entity: 'Team',
      entityId: id,
    });
  }

  private async assertParentExists(departmentId: string | null | undefined): Promise<void> {
    if (!departmentId) {
      return;
    }
    const parent = await this.db.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!parent) {
      throw AppError.notFound('department');
    }
  }

  private async assertMembersExist(userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    const found = await this.db.user.count({ where: { id: { in: userIds }, type: 'AGENT' } });
    if (found !== new Set(userIds).size) {
      throw AppError.validation('One or more users do not exist in this organization');
    }
  }
}
