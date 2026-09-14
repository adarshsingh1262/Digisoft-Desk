/** Shared projections so the list, detail and realtime payloads stay consistent. */
export const TICKET_LIST_SELECT = {
  id: true,
  ticketNumber: true,
  subject: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  dueAt: true,
  resolvedAt: true,
  closedAt: true,
  firstResponseAt: true,
  firstResponseDueAt: true,
  resolutionDueAt: true,
  firstResponseBreachedAt: true,
  resolutionBreachedAt: true,
  slaPausedAt: true,
  slaPolicy: { select: { id: true, name: true } },
  status: { select: { id: true, name: true, color: true, isResolved: true, isClosed: true, pausesSla: true } },
  priority: { select: { id: true, name: true, color: true, weight: true } },
  category: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  assignedAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  account: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  _count: { select: { messages: true, attachments: true } },
} as const;

export const TICKET_DETAIL_SELECT = {
  ...TICKET_LIST_SELECT,
  description: true,
  resolutionNote: true,
  customFields: true,
  mergedIntoTicketId: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      jobTitle: true,
      isVip: true,
      account: { select: { id: true, name: true } },
    },
  },
  followers: { select: { userId: true } },
  links: {
    select: {
      id: true,
      type: true,
      linkedTicket: {
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: { select: { name: true, color: true } },
        },
      },
    },
  },
} as const;

export const MESSAGE_SELECT = {
  id: true,
  ticketId: true,
  type: true,
  direction: true,
  bodyText: true,
  bodyHtml: true,
  channel: true,
  createdAt: true,
  authorUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  authorContact: { select: { id: true, firstName: true, lastName: true, email: true } },
  attachments: {
    select: { id: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
  },
} as const;
