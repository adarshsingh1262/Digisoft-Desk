import type { PrismaClient } from '@digisoft/db';
import type { TicketFacts } from './conditions';

export const FACT_SELECT = {
  id: true,
  organizationId: true,
  ticketNumber: true,
  subject: true,
  description: true,
  source: true,
  statusId: true,
  priorityId: true,
  departmentId: true,
  categoryId: true,
  assignedAgentId: true,
  contactId: true,
  accountId: true,
  resolutionNote: true,
  createdAt: true,
  firstResponseAt: true,
  resolvedAt: true,
  slaPolicyId: true,
  firstResponseDueAt: true,
  resolutionDueAt: true,
  slaPausedAt: true,
  firstResponseRemainingMin: true,
  resolutionRemainingMin: true,
  status: { select: { id: true, name: true, isResolved: true, isClosed: true, pausesSla: true } },
  priority: { select: { id: true, name: true, weight: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true, isVip: true } },
  assignedAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
  department: { select: { id: true, name: true } },
  organization: { select: { name: true } },
  tags: { select: { tagId: true } },
} as const;

export type TicketRecord = NonNullable<
  Awaited<ReturnType<typeof loadTicket>>
>;

/** Loads everything the engine needs about one ticket, scoped by organization. */
export async function loadTicket(prisma: PrismaClient, organizationId: string, ticketId: string) {
  return prisma.ticket.findFirst({
    where: { id: ticketId, organizationId, deletedAt: null },
    select: FACT_SELECT,
  });
}

export function toFacts(ticket: TicketRecord): TicketFacts {
  return {
    statusId: ticket.statusId,
    priorityId: ticket.priorityId,
    priorityWeight: ticket.priority.weight,
    departmentId: ticket.departmentId,
    categoryId: ticket.categoryId,
    assignedAgentId: ticket.assignedAgentId,
    contactId: ticket.contactId,
    accountId: ticket.accountId,
    source: ticket.source,
    tagIds: ticket.tags.map((tag) => tag.tagId),
    subject: ticket.subject,
    description: ticket.description,
    contactIsVip: ticket.contact?.isVip ?? false,
  };
}
