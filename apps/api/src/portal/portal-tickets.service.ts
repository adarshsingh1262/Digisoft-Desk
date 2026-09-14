import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, TenantPrismaClient } from '@digisoft/db';
import type {
  AuthenticatedUser,
  PortalCreateTicketInput,
  PortalListTicketsQuery,
  PortalReplyInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { pageMeta, toSkipTake } from '../common/dto/pagination';
import type { Paginated } from '../common/interceptors/response.interceptor';
import { TicketsService } from '../tickets/tickets.service';
import { TicketMessagesService } from '../tickets/ticket-messages.service';
import type { PortalHelpCenter } from './portal.types';

/** Only what a customer should see: no internal notes, no assignee workload, no audit. */
const PORTAL_TICKET_SELECT = {
  id: true,
  ticketNumber: true,
  subject: true,
  description: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
  firstResponseDueAt: true,
  resolutionDueAt: true,
  status: { select: { id: true, name: true, color: true, isResolved: true, isClosed: true } },
  priority: { select: { id: true, name: true, color: true } },
  department: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  assignedAgent: { select: { id: true, firstName: true, lastName: true } },
} as const;

const PORTAL_MESSAGE_SELECT = {
  id: true,
  bodyText: true,
  bodyHtml: true,
  direction: true,
  createdAt: true,
  authorUser: { select: { id: true, firstName: true, lastName: true } },
  authorContact: { select: { id: true, firstName: true, lastName: true } },
  attachments: { select: { id: true, fileName: true, fileSize: true, mimeType: true } },
} as const;

@Injectable()
export class PortalTicketsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly tickets: TicketsService,
    private readonly messages: TicketMessagesService,
  ) {}

  async list(actor: AuthenticatedUser, query: PortalListTicketsQuery): Promise<Paginated<unknown>> {
    const where: Prisma.TicketWhereInput = {
      AND: [
        this.ownership(actor),
        {
          ...(query.open ? { status: { isResolved: false, isClosed: false } } : {}),
          ...(query.q
            ? {
                OR: [
                  { subject: { contains: query.q, mode: 'insensitive' as const } },
                  { description: { contains: query.q, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
      ],
    };

    const [items, total] = await Promise.all([
      this.db.ticket.findMany({
        where,
        select: PORTAL_TICKET_SELECT,
        orderBy: { createdAt: query.order },
        ...toSkipTake(query),
      }),
      this.db.ticket.count({ where }),
    ]);

    return { items, meta: pageMeta(query, total) };
  }

  async findById(actor: AuthenticatedUser, id: string) {
    const ticket = await this.db.ticket.findFirst({
      where: { AND: [{ id }, this.ownership(actor)] },
      select: PORTAL_TICKET_SELECT,
    });
    if (!ticket) {
      throw AppError.notFound('ticket');
    }

    // Internal comments are excluded in the query, not filtered out afterwards.
    const messages = await this.db.ticketMessage.findMany({
      where: { ticketId: id, type: { not: 'INTERNAL_COMMENT' } },
      select: PORTAL_MESSAGE_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    return { ...ticket, messages };
  }

  async create(
    helpCenter: PortalHelpCenter,
    actor: AuthenticatedUser,
    input: PortalCreateTicketInput,
  ) {
    if (!helpCenter.allowTicketSubmission) {
      throw AppError.validation('This help center is not accepting requests right now');
    }
    await this.assertSelectable(input);

    const ticket = await this.tickets.createTicket({
      organizationId: helpCenter.organizationId,
      subject: input.subject,
      description: input.description,
      source: 'PORTAL',
      contactId: actor.contactId,
      departmentId: input.departmentId ?? null,
      categoryId: input.categoryId ?? null,
      priorityId: input.priorityId ?? null,
      createdById: actor.id,
    });

    return this.findById(actor, ticket.id);
  }

  async reply(actor: AuthenticatedUser, ticketId: string, input: PortalReplyInput) {
    await this.messages.addCustomerReply(ticketId, actor, {
      bodyText: input.bodyText,
      attachmentIds: input.attachmentIds,
    });
    return this.findById(actor, ticketId);
  }

  /** Customers may close their own request; reopening happens by replying. */
  async close(actor: AuthenticatedUser, ticketId: string) {
    const ticket = await this.db.ticket.findFirst({
      where: { AND: [{ id: ticketId }, this.ownership(actor)] },
      select: { id: true, status: { select: { isClosed: true } } },
    });
    if (!ticket) {
      throw AppError.notFound('ticket');
    }
    if (ticket.status.isClosed) {
      throw AppError.validation('This request is already closed');
    }

    await this.tickets.close(ticketId, actor);
    return this.findById(actor, ticketId);
  }

  /** The departments, categories and priorities a customer may choose from. */
  async options() {
    const [departments, categories, priorities] = await Promise.all([
      this.db.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.db.ticketCategory.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.db.ticketPriority.findMany({
        select: { id: true, name: true, color: true },
        orderBy: { position: 'asc' },
      }),
    ]);
    return { departments, categories, priorities };
  }

  private ownership(actor: AuthenticatedUser): Prisma.TicketWhereInput {
    const scopes: Prisma.TicketWhereInput[] = [{ createdById: actor.id }];
    if (actor.contactId) {
      scopes.push({ contactId: actor.contactId });
    }
    return { OR: scopes };
  }

  private async assertSelectable(input: PortalCreateTicketInput): Promise<void> {
    if (input.departmentId) {
      const department = await this.db.department.findFirst({
        where: { id: input.departmentId },
        select: { id: true },
      });
      if (!department) throw AppError.validation('The selected department does not exist');
    }
    if (input.categoryId) {
      const category = await this.db.ticketCategory.findFirst({
        where: { id: input.categoryId },
        select: { id: true },
      });
      if (!category) throw AppError.validation('The selected category does not exist');
    }
    if (input.priorityId) {
      const priority = await this.db.ticketPriority.findFirst({
        where: { id: input.priorityId },
        select: { id: true },
      });
      if (!priority) throw AppError.validation('The selected priority does not exist');
    }
  }
}
