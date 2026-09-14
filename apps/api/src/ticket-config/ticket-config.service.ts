import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  TagInput,
  TicketCategoryInput,
  TicketPriorityInput,
  TicketStatusInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import type { TenantPrismaClient } from '@digisoft/db';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

const STATUS_FIELDS = {
  id: true,
  name: true,
  systemKey: true,
  color: true,
  position: true,
  isDefault: true,
  isResolved: true,
  isClosed: true,
  isSystem: true,
} as const;

const PRIORITY_FIELDS = {
  id: true,
  name: true,
  systemKey: true,
  color: true,
  weight: true,
  position: true,
  isDefault: true,
  isSystem: true,
} as const;

/**
 * Statuses, priorities, categories and tags. These are rows rather than enums so an
 * organization can shape its own workflow; the ticket engine reads the behaviour flags
 * and never the names.
 */
@Injectable()
export class TicketConfigService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  listStatuses() {
    return this.db.ticketStatus.findMany({ select: STATUS_FIELDS, orderBy: { position: 'asc' } });
  }

  listPriorities() {
    return this.db.ticketPriority.findMany({
      select: PRIORITY_FIELDS,
      orderBy: { position: 'asc' },
    });
  }

  listCategories() {
    return this.db.ticketCategory.findMany({
      select: { id: true, name: true, description: true, parentId: true },
      orderBy: { name: 'asc' },
    });
  }

  listTags() {
    return this.db.tag.findMany({
      select: { id: true, name: true, color: true, _count: { select: { tickets: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /** The status a new ticket lands in when the caller does not choose one. */
  async defaultStatusId(): Promise<string> {
    const status =
      (await this.db.ticketStatus.findFirst({
        where: { isDefault: true },
        select: { id: true },
      })) ??
      (await this.db.ticketStatus.findFirst({
        orderBy: { position: 'asc' },
        select: { id: true },
      }));
    if (!status) {
      throw AppError.validation('This organization has no ticket statuses configured');
    }
    return status.id;
  }

  async defaultPriorityId(): Promise<string> {
    const priority =
      (await this.db.ticketPriority.findFirst({
        where: { isDefault: true },
        select: { id: true },
      })) ??
      (await this.db.ticketPriority.findFirst({
        orderBy: { position: 'asc' },
        select: { id: true },
      }));
    if (!priority) {
      throw AppError.validation('This organization has no ticket priorities configured');
    }
    return priority.id;
  }

  async createStatus(actor: AuthenticatedUser, input: TicketStatusInput) {
    const status = await this.db.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.ticketStatus.updateMany({ where: {}, data: { isDefault: false } });
      }
      return tx.ticketStatus.create({
        data: { organizationId: actor.organizationId, ...input },
        select: STATUS_FIELDS,
      });
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ticket_status.created',
      entity: 'TicketStatus',
      entityId: status.id,
      newValue: status,
    });
    return status;
  }

  async updateStatus(id: string, actor: AuthenticatedUser, input: Partial<TicketStatusInput>) {
    const before = await this.findStatus(id);
    const status = await this.db.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.ticketStatus.updateMany({ where: {}, data: { isDefault: false } });
      }
      return tx.ticketStatus.update({ where: { id }, data: input, select: STATUS_FIELDS });
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ticket_status.updated',
      entity: 'TicketStatus',
      entityId: id,
      oldValue: before,
      newValue: status,
    });
    return status;
  }

  async removeStatus(id: string, actor: AuthenticatedUser): Promise<void> {
    const status = await this.findStatus(id);
    if (status.isDefault) {
      throw AppError.validation('Make another status the default before deleting this one');
    }
    const inUse = await this.db.ticket.count({ where: { statusId: id } });
    if (inUse > 0) {
      throw AppError.conflict(`${inUse} ticket(s) still use this status`);
    }
    await this.db.ticketStatus.delete({ where: { id } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ticket_status.deleted',
      entity: 'TicketStatus',
      entityId: id,
    });
  }

  async createPriority(actor: AuthenticatedUser, input: TicketPriorityInput) {
    const priority = await this.db.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.ticketPriority.updateMany({ where: {}, data: { isDefault: false } });
      }
      return tx.ticketPriority.create({
        data: { organizationId: actor.organizationId, ...input },
        select: PRIORITY_FIELDS,
      });
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ticket_priority.created',
      entity: 'TicketPriority',
      entityId: priority.id,
      newValue: priority,
    });
    return priority;
  }

  async updatePriority(id: string, actor: AuthenticatedUser, input: Partial<TicketPriorityInput>) {
    const before = await this.findPriority(id);
    const priority = await this.db.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.ticketPriority.updateMany({ where: {}, data: { isDefault: false } });
      }
      return tx.ticketPriority.update({ where: { id }, data: input, select: PRIORITY_FIELDS });
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ticket_priority.updated',
      entity: 'TicketPriority',
      entityId: id,
      oldValue: before,
      newValue: priority,
    });
    return priority;
  }

  async removePriority(id: string, actor: AuthenticatedUser): Promise<void> {
    const priority = await this.findPriority(id);
    if (priority.isDefault) {
      throw AppError.validation('Make another priority the default before deleting this one');
    }
    const inUse = await this.db.ticket.count({ where: { priorityId: id } });
    if (inUse > 0) {
      throw AppError.conflict(`${inUse} ticket(s) still use this priority`);
    }
    await this.db.ticketPriority.delete({ where: { id } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ticket_priority.deleted',
      entity: 'TicketPriority',
      entityId: id,
    });
  }

  async createCategory(actor: AuthenticatedUser, input: TicketCategoryInput) {
    if (input.parentId) {
      await this.assertCategoryExists(input.parentId);
    }
    const category = await this.db.ticketCategory.create({
      data: { organizationId: actor.organizationId, ...input },
      select: { id: true, name: true, description: true, parentId: true },
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ticket_category.created',
      entity: 'TicketCategory',
      entityId: category.id,
      newValue: category,
    });
    return category;
  }

  async updateCategory(id: string, actor: AuthenticatedUser, input: Partial<TicketCategoryInput>) {
    await this.assertCategoryExists(id);
    if (input.parentId) {
      if (input.parentId === id) {
        throw AppError.validation('A category cannot be its own parent');
      }
      await this.assertCategoryExists(input.parentId);
    }
    const category = await this.db.ticketCategory.update({
      where: { id },
      data: input,
      select: { id: true, name: true, description: true, parentId: true },
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ticket_category.updated',
      entity: 'TicketCategory',
      entityId: id,
      newValue: category,
    });
    return category;
  }

  async removeCategory(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.assertCategoryExists(id);
    await this.db.ticketCategory.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ticket_category.deleted',
      entity: 'TicketCategory',
      entityId: id,
    });
  }

  async createTag(actor: AuthenticatedUser, input: TagInput) {
    const existing = await this.db.tag.findFirst({ where: { name: input.name }, select: { id: true } });
    if (existing) {
      throw AppError.conflict('A tag with this name already exists');
    }
    const tag = await this.db.tag.create({
      data: { organizationId: actor.organizationId, ...input },
      select: { id: true, name: true, color: true },
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'tag.created',
      entity: 'Tag',
      entityId: tag.id,
      newValue: tag,
    });
    return tag;
  }

  async removeTag(id: string, actor: AuthenticatedUser): Promise<void> {
    const tag = await this.db.tag.findUnique({ where: { id }, select: { id: true } });
    if (!tag) {
      throw AppError.notFound('tag');
    }
    await this.db.tag.delete({ where: { id } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'tag.deleted',
      entity: 'Tag',
      entityId: id,
    });
  }

  private async findStatus(id: string) {
    const status = await this.db.ticketStatus.findUnique({ where: { id }, select: STATUS_FIELDS });
    if (!status) {
      throw AppError.notFound('ticket status');
    }
    return status;
  }

  private async findPriority(id: string) {
    const priority = await this.db.ticketPriority.findUnique({
      where: { id },
      select: PRIORITY_FIELDS,
    });
    if (!priority) {
      throw AppError.notFound('ticket priority');
    }
    return priority;
  }

  private async assertCategoryExists(id: string): Promise<void> {
    const category = await this.db.ticketCategory.findUnique({ where: { id }, select: { id: true } });
    if (!category) {
      throw AppError.notFound('ticket category');
    }
  }
}
