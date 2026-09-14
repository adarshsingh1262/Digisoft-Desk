import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  BusinessHoursInput,
  HolidayInput,
  UpdateOrganizationInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import type { TenantPrismaClient } from '@digisoft/db';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

const ORGANIZATION_FIELDS = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  domain: true,
  timezone: true,
  locale: true,
  currency: true,
  settings: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findCurrent(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: ORGANIZATION_FIELDS,
    });
    if (!organization) {
      throw AppError.notFound('organization');
    }
    return organization;
  }

  async update(actor: AuthenticatedUser, input: UpdateOrganizationInput) {
    const organizationId = actor.organizationId;
    const before = await this.findCurrent(organizationId);
    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: input,
      select: ORGANIZATION_FIELDS,
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'organization.updated',
      entity: 'Organization',
      entityId: organizationId,
      oldValue: before,
      newValue: organization,
    });
    return organization;
  }

  listBusinessHours() {
    return this.db.businessHours.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { holidays: { orderBy: { date: 'asc' } } },
    });
  }

  async createBusinessHours(actor: AuthenticatedUser, input: BusinessHoursInput) {
    const created = await this.db.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.businessHours.updateMany({ where: {}, data: { isDefault: false } });
      }
      return tx.businessHours.create({
        data: {
          organizationId: actor.organizationId,
          name: input.name,
          timezone: input.timezone,
          isDefault: input.isDefault,
          weeklySchedule: input.weeklySchedule,
        },
        include: { holidays: true },
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'business_hours.created',
      entity: 'BusinessHours',
      entityId: created.id,
      newValue: created,
    });
    return created;
  }

  async updateBusinessHours(id: string, actor: AuthenticatedUser, input: Partial<BusinessHoursInput>) {
    const updated = await this.db.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.businessHours.updateMany({ where: {}, data: { isDefault: false } });
      }
      return tx.businessHours.update({
        where: { id },
        data: {
          name: input.name,
          timezone: input.timezone,
          isDefault: input.isDefault,
          ...(input.weeklySchedule ? { weeklySchedule: input.weeklySchedule } : {}),
        },
        include: { holidays: true },
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'business_hours.updated',
      entity: 'BusinessHours',
      entityId: id,
      newValue: updated,
    });
    return updated;
  }

  async addHoliday(businessHoursId: string, actor: AuthenticatedUser, input: HolidayInput) {
    // Confirms the parent belongs to this tenant before writing the child row.
    await this.db.businessHours.findUniqueOrThrow({
      where: { id: businessHoursId },
      select: { id: true },
    });

    const holiday = await this.db.holiday.create({
      data: {
        organizationId: actor.organizationId,
        businessHoursId,
        name: input.name,
        date: input.date,
      },
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'holiday.created',
      entity: 'Holiday',
      entityId: holiday.id,
      newValue: holiday,
    });
    return holiday;
  }

  async removeHoliday(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.db.holiday.delete({ where: { id } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'holiday.deleted',
      entity: 'Holiday',
      entityId: id,
    });
  }
}
