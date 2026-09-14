import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@digisoft/db';
import type { TenantPrismaClient } from '@digisoft/db';
import type {
  AuthenticatedUser,
  CreateActivityInput,
  ListActivitiesQuery,
  UpdateActivityInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { orderBy, pageMeta, toSkipTake } from '../common/dto/pagination';
import type { Paginated } from '../common/interceptors/response.interceptor';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketsService } from '../tickets/tickets.service';

const SORTABLE = ['createdAt', 'updatedAt', 'dueAt', 'startAt', 'subject'] as const;

export const ACTIVITY_SELECT = {
  id: true,
  type: true,
  status: true,
  subject: true,
  description: true,
  dueAt: true,
  startAt: true,
  endAt: true,
  completedAt: true,
  callDirection: true,
  callDurationSeconds: true,
  callOutcome: true,
  location: true,
  createdAt: true,
  updatedAt: true,
  ticket: { select: { id: true, ticketNumber: true, subject: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  account: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** Tasks, calls and events tied to tickets, contacts and accounts. */
@Injectable()
export class ActivitiesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly tickets: TicketsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListActivitiesQuery): Promise<Paginated<unknown>> {
    const where: Prisma.ActivityWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.ticketId ? { ticketId: query.ticketId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.assignedToMe ? { assignedToId: actor.id } : {}),
      ...(query.overdue ? { status: 'OPEN', dueAt: { lt: new Date() } } : {}),
      ...(query.q ? { subject: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.db.activity.findMany({
        where,
        select: ACTIVITY_SELECT,
        orderBy: orderBy(query.sort, SORTABLE, query.order, 'createdAt'),
        ...toSkipTake(query),
      }),
      this.db.activity.count({ where }),
    ]);
    return { items, meta: pageMeta(query, total) };
  }

  async findById(id: string) {
    const activity = await this.db.activity.findUnique({ where: { id }, select: ACTIVITY_SELECT });
    if (!activity) throw AppError.notFound('activity');
    return activity;
  }

  async create(actor: AuthenticatedUser, input: CreateActivityInput) {
    await this.assertReferences(actor, input);
    this.assertTypeFields(input);

    const activity = await this.db.activity.create({
      data: {
        organizationId: actor.organizationId,
        type: input.type,
        subject: input.subject,
        description: input.description ?? null,
        dueAt: input.dueAt ?? null,
        startAt: input.startAt ?? null,
        endAt: input.endAt ?? null,
        callDirection: input.callDirection ?? null,
        callDurationSeconds: input.callDurationSeconds ?? null,
        callOutcome: input.callOutcome ?? null,
        location: input.location ?? null,
        ticketId: input.ticketId ?? null,
        contactId: input.contactId ?? null,
        accountId: input.accountId ?? null,
        assignedToId: input.assignedToId ?? null,
        createdById: actor.id,
        // Logged calls are complete the moment they are recorded.
        ...(input.type === 'CALL' && input.callDurationSeconds != null
          ? { status: 'COMPLETED' as const, completedAt: new Date() }
          : {}),
      },
      select: ACTIVITY_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'activity.created',
      entity: activity.ticket ? 'Ticket' : 'Activity',
      entityId: activity.ticket?.id ?? activity.id,
      newValue: { activityId: activity.id, type: activity.type, subject: activity.subject },
    });

    if (activity.assignedTo && activity.assignedTo.id !== actor.id) {
      await this.notifications.create(actor.organizationId, {
        userId: activity.assignedTo.id,
        type: 'activity.assigned',
        title: `${activity.type === 'TASK' ? 'Task' : activity.type === 'CALL' ? 'Call' : 'Event'} assigned to you`,
        body: activity.subject,
        link: activity.ticket ? `/tickets/${activity.ticket.id}` : '/activities',
        data: { activityId: activity.id },
      });
    }
    return activity;
  }

  async update(id: string, actor: AuthenticatedUser, input: UpdateActivityInput) {
    const before = await this.findById(id);
    await this.assertReferences(actor, input);

    const { status, ...rest } = input;
    const activity = await this.db.activity.update({
      where: { id },
      data: {
        ...rest,
        ...(status !== undefined
          ? {
              status,
              completedAt: status === 'COMPLETED' ? (before.completedAt ?? new Date()) : null,
            }
          : {}),
      },
      select: ACTIVITY_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: status && status !== before.status ? `activity.${status.toLowerCase()}` : 'activity.updated',
      entity: activity.ticket ? 'Ticket' : 'Activity',
      entityId: activity.ticket?.id ?? activity.id,
      oldValue: { status: before.status, subject: before.subject },
      newValue: { activityId: activity.id, status: activity.status, subject: activity.subject },
    });
    return activity;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const activity = await this.findById(id);
    await this.db.activity.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'activity.deleted',
      entity: activity.ticket ? 'Ticket' : 'Activity',
      entityId: activity.ticket?.id ?? activity.id,
      oldValue: { activityId: id, subject: activity.subject },
    });
  }

  private assertTypeFields(input: CreateActivityInput): void {
    if (input.type === 'EVENT' && !input.startAt) {
      throw AppError.validation('An event needs a start time');
    }
    if (input.startAt && input.endAt && input.endAt < input.startAt) {
      throw AppError.validation('An event cannot end before it starts');
    }
  }

  private async assertReferences(
    actor: AuthenticatedUser,
    input: Partial<Pick<CreateActivityInput, 'ticketId' | 'contactId' | 'accountId' | 'assignedToId'>>,
  ): Promise<void> {
    if (input.ticketId) await this.tickets.assertVisible(actor, input.ticketId);
    if (input.contactId) {
      const contact = await this.db.contact.findUnique({ where: { id: input.contactId }, select: { id: true } });
      if (!contact) throw AppError.notFound('contact');
    }
    if (input.accountId) {
      const account = await this.db.account.findUnique({ where: { id: input.accountId }, select: { id: true } });
      if (!account) throw AppError.notFound('account');
    }
    if (input.assignedToId) {
      const user = await this.db.user.findFirst({
        where: { id: input.assignedToId, type: 'AGENT', isActive: true },
        select: { id: true },
      });
      if (!user) throw AppError.notFound('agent');
    }
  }
}
