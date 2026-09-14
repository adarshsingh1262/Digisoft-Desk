import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@digisoft/db';
import type { AuthenticatedUser, CreateMessageInput } from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import type { TenantPrismaClient } from '@digisoft/db';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { pageMeta, toSkipTake } from '../common/dto/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketsService } from './tickets.service';
import { TicketEventsService } from './ticket-events.service';
import { MESSAGE_SELECT } from './ticket.select';
import { canReadInternalNotes } from './ticket-visibility';
import { EngineService } from '../engine/engine.service';

@Injectable()
export class TicketMessagesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly tickets: TicketsService,
    private readonly notifications: NotificationsService,
    private readonly events: TicketEventsService,
    private readonly audit: AuditService,
    private readonly engine: EngineService,
  ) {}

  async list(
    ticketId: string,
    actor: AuthenticatedUser,
    query: { page: number; pageSize: number },
  ) {
    await this.tickets.assertVisible(actor, ticketId);

    // Internal comments are filtered out in the query itself, so a customer-facing
    // caller cannot receive one even if a projection later changes.
    const where: Prisma.TicketMessageWhereInput = {
      ticketId,
      ...(canReadInternalNotes(actor) ? {} : { type: { not: 'INTERNAL_COMMENT' } }),
    };

    const [items, total] = await Promise.all([
      this.db.ticketMessage.findMany({
        where,
        select: MESSAGE_SELECT,
        orderBy: { createdAt: 'asc' },
        ...toSkipTake(query),
      }),
      this.db.ticketMessage.count({ where }),
    ]);

    return { items, meta: pageMeta(query, total) };
  }

  /** Customer-visible reply. Stamps the first response time on the ticket. */
  addReply(ticketId: string, actor: AuthenticatedUser, input: CreateMessageInput) {
    return this.addMessage(ticketId, actor, input, 'PUBLIC_REPLY');
  }

  /** Agent-only note. Never leaves the agent workspace. */
  addComment(ticketId: string, actor: AuthenticatedUser, input: CreateMessageInput) {
    return this.addMessage(ticketId, actor, input, 'INTERNAL_COMMENT');
  }

  /**
   * A reply written by the customer in the portal. It is stored as an inbound message
   * authored by the contact — never by a user — reopens a ticket the customer had been
   * told was resolved, and fires CUSTOMER_REPLIED so automation can react.
   */
  async addCustomerReply(
    ticketId: string,
    actor: AuthenticatedUser,
    input: { bodyText: string; attachmentIds: string[] },
  ) {
    const ticket = await this.db.ticket.findFirst({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        department: { select: { id: true } },
        assignedAgent: { select: { id: true } },
        followers: { select: { userId: true } },
        status: { select: { id: true, isResolved: true, isClosed: true } },
      },
    });
    if (!ticket) {
      throw AppError.notFound('ticket');
    }
    await this.tickets.assertVisible(actor, ticketId);
    await this.assertAttachmentsAvailable(input.attachmentIds, ticketId);

    const wasClosed = ticket.status.isResolved || ticket.status.isClosed;
    const reopenStatus = wasClosed
      ? await this.db.ticketStatus.findFirst({
          where: { isResolved: false, isClosed: false },
          orderBy: { position: 'asc' },
          select: { id: true, name: true },
        })
      : null;

    const message = await this.db.$transaction(async (tx) => {
      const created = await tx.ticketMessage.create({
        data: {
          organizationId: actor.organizationId,
          ticketId,
          type: 'PUBLIC_REPLY',
          direction: 'INBOUND',
          authorContactId: actor.contactId,
          bodyText: input.bodyText,
          channel: 'PORTAL',
        },
        select: MESSAGE_SELECT,
      });

      if (input.attachmentIds.length > 0) {
        await tx.attachment.updateMany({
          where: { id: { in: input.attachmentIds }, ticketId },
          data: { messageId: created.id },
        });
      }

      await tx.ticket.update({
        where: { id: ticketId },
        data: reopenStatus
          ? { statusId: reopenStatus.id, resolvedAt: null, closedAt: null, updatedAt: new Date() }
          : { updatedAt: new Date() },
      });

      return created;
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ticket.customer_replied',
      entity: 'Ticket',
      entityId: ticketId,
      newValue: { messageId: message.id, reopened: reopenStatus !== null },
    });

    this.events.messageCreated(actor.organizationId, ticket, {
      id: message.id,
      type: 'PUBLIC_REPLY',
    });
    await this.notifyCustomerReply(actor.organizationId, ticket);

    if (reopenStatus) {
      await this.engine.syncSlaPause(actor.organizationId, ticketId, false);
      await this.engine.trigger(actor.organizationId, ticketId, 'STATUS_CHANGED', {
        from: 'resolved',
        to: reopenStatus.name,
        reason: 'customer_reply',
      });
    }
    await this.engine.trigger(actor.organizationId, ticketId, 'CUSTOMER_REPLIED');

    return message;
  }

  private async addMessage(
    ticketId: string,
    actor: AuthenticatedUser,
    input: CreateMessageInput,
    type: 'PUBLIC_REPLY' | 'INTERNAL_COMMENT',
  ) {
    const ticket = await this.db.ticket.findFirst({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        firstResponseAt: true,
        department: { select: { id: true } },
        assignedAgent: { select: { id: true } },
        followers: { select: { userId: true } },
      },
    });
    if (!ticket) {
      throw AppError.notFound('ticket');
    }
    await this.tickets.assertVisible(actor, ticketId);
    await this.assertAttachmentsAvailable(input.attachmentIds, ticketId);

    const message = await this.db.$transaction(async (tx) => {
      const created = await tx.ticketMessage.create({
        data: {
          organizationId: actor.organizationId,
          ticketId,
          type,
          direction: 'OUTBOUND',
          authorUserId: actor.id,
          bodyText: input.bodyText,
          bodyHtml: input.bodyHtml ?? null,
        },
        select: MESSAGE_SELECT,
      });

      if (input.attachmentIds.length > 0) {
        await tx.attachment.updateMany({
          where: { id: { in: input.attachmentIds }, ticketId },
          data: { messageId: created.id },
        });
      }

      if (type === 'PUBLIC_REPLY' && !ticket.firstResponseAt) {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { firstResponseAt: created.createdAt },
        });
      } else {
        // Keep updatedAt moving so the queue sorts by real activity.
        await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
      }

      return created;
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: type === 'PUBLIC_REPLY' ? 'ticket.replied' : 'ticket.commented',
      entity: 'Ticket',
      entityId: ticketId,
      newValue: { messageId: message.id, type },
    });

    this.events.messageCreated(actor.organizationId, ticket, { id: message.id, type });
    await this.notifyFollowers(actor, ticket, type);
    if (type === 'PUBLIC_REPLY') {
      await this.engine.trigger(actor.organizationId, ticketId, 'AGENT_REPLIED');
    }

    return message.attachments.length === input.attachmentIds.length
      ? message
      : this.db.ticketMessage.findUniqueOrThrow({
          where: { id: message.id },
          select: MESSAGE_SELECT,
        });
  }

  private async notifyFollowers(
    actor: AuthenticatedUser,
    ticket: { id: string; ticketNumber: number; subject: string; followers: { userId: string }[] },
    type: 'PUBLIC_REPLY' | 'INTERNAL_COMMENT',
  ): Promise<void> {
    const recipients = ticket.followers
      .map((follower) => follower.userId)
      .filter((userId) => userId !== actor.id);

    for (const userId of recipients) {
      await this.notifications.create(actor.organizationId, {
        userId,
        type: type === 'PUBLIC_REPLY' ? 'ticket.replied' : 'ticket.commented',
        title: `New ${type === 'PUBLIC_REPLY' ? 'reply' : 'internal comment'} on #${ticket.ticketNumber}`,
        body: ticket.subject,
        link: `/tickets/${ticket.id}`,
        data: { ticketId: ticket.id },
      });
    }
  }

  /** Everyone following the ticket hears about a customer reply, assignee included. */
  private async notifyCustomerReply(
    organizationId: string,
    ticket: {
      id: string;
      ticketNumber: number;
      subject: string;
      assignedAgent: { id: string } | null;
      followers: { userId: string }[];
    },
  ): Promise<void> {
    const recipients = new Set(ticket.followers.map((follower) => follower.userId));
    if (ticket.assignedAgent) {
      recipients.add(ticket.assignedAgent.id);
    }

    for (const userId of recipients) {
      await this.notifications.create(organizationId, {
        userId,
        type: 'ticket.customer_replied',
        title: `Customer replied on #${ticket.ticketNumber}`,
        body: ticket.subject,
        link: `/tickets/${ticket.id}`,
        data: { ticketId: ticket.id },
      });
    }
  }

  private async assertAttachmentsAvailable(
    attachmentIds: string[],
    ticketId: string,
  ): Promise<void> {
    if (attachmentIds.length === 0) {
      return;
    }
    const found = await this.db.attachment.count({
      where: { id: { in: attachmentIds }, ticketId, messageId: null },
    });
    if (found !== new Set(attachmentIds).size) {
      throw AppError.validation(
        'One or more attachments do not belong to this ticket or are already attached to a message',
      );
    }
  }
}
