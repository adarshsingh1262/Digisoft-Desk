import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@digisoft/shared';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export const TICKET_EVENTS = {
  CREATED: 'ticket.created',
  UPDATED: 'ticket.updated',
  ASSIGNED: 'ticket.assigned',
  STATUS_CHANGED: 'ticket.status_changed',
  MESSAGE_CREATED: 'message.created',
} as const;

interface TicketAudience {
  id: string;
  department?: { id: string } | null;
  assignedAgent?: { id: string } | null;
}

/**
 * Publishes ticket activity to exactly the sockets entitled to it: the organization's
 * full-queue room (agents holding `ticket.read.all`), the ticket's department room and
 * the assignee. A ticket a light agent cannot read never reaches their socket.
 */
@Injectable()
export class TicketEventsService {
  constructor(private readonly realtime: RealtimeGateway) {}

  ticketCreated(actor: AuthenticatedUser, ticket: TicketAudience & object): void {
    this.emit(actor.organizationId, ticket, TICKET_EVENTS.CREATED, ticket);
  }

  ticketUpdated(actor: AuthenticatedUser, ticket: TicketAudience & object): void {
    this.emit(actor.organizationId, ticket, TICKET_EVENTS.UPDATED, ticket);
  }

  ticketAssigned(actor: AuthenticatedUser, ticket: TicketAudience & object): void {
    this.emit(actor.organizationId, ticket, TICKET_EVENTS.ASSIGNED, ticket);
  }

  ticketStatusChanged(actor: AuthenticatedUser, ticket: TicketAudience & object): void {
    this.emit(actor.organizationId, ticket, TICKET_EVENTS.STATUS_CHANGED, ticket);
  }

  messageCreated(
    organizationId: string,
    ticket: TicketAudience,
    message: { id: string; type: string },
  ): void {
    this.emit(organizationId, ticket, TICKET_EVENTS.MESSAGE_CREATED, {
      ticketId: ticket.id,
      messageId: message.id,
      type: message.type,
    });
  }

  private emit(
    organizationId: string,
    ticket: TicketAudience,
    event: string,
    payload: unknown,
  ): void {
    this.realtime.emitToTicketAudience(
      organizationId,
      {
        departmentId: ticket.department?.id ?? null,
        assignedAgentId: ticket.assignedAgent?.id ?? null,
      },
      event,
      payload,
    );
  }
}
