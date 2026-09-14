import type { TicketRecord } from './facts';

/** Replaces the documented placeholders; anything unknown is left untouched. */
export function renderTemplate(template: string, ticket: TicketRecord): string {
  const contactName = ticket.contact
    ? `${ticket.contact.firstName} ${ticket.contact.lastName ?? ''}`.trim()
    : '';
  const assigneeName = ticket.assignedAgent
    ? `${ticket.assignedAgent.firstName} ${ticket.assignedAgent.lastName}`
    : '';
  const values: Record<string, string> = {
    'ticket.number': `#${ticket.ticketNumber}`,
    'ticket.subject': ticket.subject,
    'ticket.status': ticket.status.name,
    'ticket.priority': ticket.priority.name,
    'contact.name': contactName,
    'assignee.name': assigneeName,
    'organization.name': ticket.organization.name,
  };
  return template.replace(/\{\{\s*([a-z.]+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}
