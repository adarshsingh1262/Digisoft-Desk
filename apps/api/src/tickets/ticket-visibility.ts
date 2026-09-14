import type { Prisma } from '@digisoft/db';
import { PERMISSIONS, type AuthenticatedUser } from '@digisoft/shared';

/**
 * Record-level read scope, applied on top of tenant isolation.
 *
 * `ticket.read.all` sees the whole organization's queue. Without it — light agents,
 * and any custom role that withholds it — an agent sees only tickets assigned to them,
 * raised by them, that they follow, or that sit in one of their departments.
 */
export function ticketVisibilityFilter(actor: AuthenticatedUser): Prisma.TicketWhereInput {
  if (actor.permissions.includes(PERMISSIONS.TICKET_READ_ALL)) {
    return {};
  }

  const scopes: Prisma.TicketWhereInput[] = [
    { assignedAgentId: actor.id },
    { createdById: actor.id },
    { followers: { some: { userId: actor.id } } },
  ];

  if (actor.departmentIds.length > 0) {
    scopes.push({ departmentId: { in: actor.departmentIds } });
  }

  return { OR: scopes };
}

/** True when the actor may see internal comments at all. */
export function canReadInternalNotes(actor: AuthenticatedUser): boolean {
  return actor.type === 'AGENT';
}
