import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Seeded statuses and priorities. `systemKey` exists so integrations can find a row
 * without depending on its label, but no application code branches on it — behaviour
 * comes from the flags, which an organization can reassign to its own rows.
 */
export const DEFAULT_TICKET_STATUSES = [
  { systemKey: 'NEW', name: 'New', color: '#2563eb', position: 0, isDefault: true },
  { systemKey: 'OPEN', name: 'Open', color: '#0ea5e9', position: 1 },
  { systemKey: 'IN_PROGRESS', name: 'In Progress', color: '#8b5cf6', position: 2 },
  { systemKey: 'ON_HOLD', name: 'On Hold', color: '#f59e0b', position: 3, pausesSla: true },
  { systemKey: 'PENDING', name: 'Pending', color: '#eab308', position: 4, pausesSla: true },
  { systemKey: 'RESOLVED', name: 'Resolved', color: '#10b981', position: 5, isResolved: true },
  {
    systemKey: 'CLOSED',
    name: 'Closed',
    color: '#64748b',
    position: 6,
    isResolved: true,
    isClosed: true,
  },
] as const;

export const DEFAULT_TICKET_PRIORITIES = [
  { systemKey: 'LOW', name: 'Low', color: '#64748b', weight: 10, position: 0 },
  { systemKey: 'MEDIUM', name: 'Medium', color: '#0ea5e9', weight: 20, position: 1, isDefault: true },
  { systemKey: 'HIGH', name: 'High', color: '#f97316', weight: 30, position: 2 },
  { systemKey: 'URGENT', name: 'Urgent', color: '#dc2626', weight: 40, position: 3 },
] as const;

export const DEFAULT_TICKET_CATEGORIES = [
  { name: 'General', description: 'Anything that does not fit another category.' },
  { name: 'Technical', description: 'Product faults, errors and outages.' },
  { name: 'Billing', description: 'Invoices, payments and subscriptions.' },
  { name: 'Feature Request', description: 'Suggestions and enhancement requests.' },
] as const;

/** Creates the ticket configuration a new organization needs to be usable. */
export async function provisionTicketDefaults(db: Db, organizationId: string): Promise<void> {
  await db.ticketStatus.createMany({
    data: DEFAULT_TICKET_STATUSES.map((status) => ({
      organizationId,
      systemKey: status.systemKey,
      name: status.name,
      color: status.color,
      position: status.position,
      isDefault: 'isDefault' in status ? status.isDefault : false,
      isResolved: 'isResolved' in status ? status.isResolved : false,
      isClosed: 'isClosed' in status ? status.isClosed : false,
      pausesSla: 'pausesSla' in status ? status.pausesSla : false,
      isSystem: true,
    })),
  });

  await db.ticketPriority.createMany({
    data: DEFAULT_TICKET_PRIORITIES.map((priority) => ({
      organizationId,
      systemKey: priority.systemKey,
      name: priority.name,
      color: priority.color,
      weight: priority.weight,
      position: priority.position,
      isDefault: 'isDefault' in priority ? priority.isDefault : false,
      isSystem: true,
    })),
  });

  await db.ticketCategory.createMany({
    data: DEFAULT_TICKET_CATEGORIES.map((category) => ({
      organizationId,
      name: category.name,
      description: category.description,
    })),
  });
}

/**
 * A starting SLA so the clock runs from day one. Targets follow the spec's example
 * (urgent 15m/4h, high 30m/8h) and count business hours on the default calendar.
 */
export async function provisionSlaDefaults(db: Db, organizationId: string): Promise<void> {
  const existing = await db.slaPolicy.count({ where: { organizationId } });
  if (existing > 0) return;

  const priorities = await db.ticketPriority.findMany({
    where: { organizationId },
    select: { id: true, systemKey: true },
  });
  const byKey = new Map(priorities.map((priority) => [priority.systemKey, priority.id]));
  const calendar = await db.businessHours.findFirst({
    where: { organizationId, isDefault: true },
    select: { id: true },
  });

  const targets = [
    { key: 'URGENT', firstResponseMinutes: 15, resolutionMinutes: 4 * 60 },
    { key: 'HIGH', firstResponseMinutes: 30, resolutionMinutes: 8 * 60 },
    { key: 'MEDIUM', firstResponseMinutes: 2 * 60, resolutionMinutes: 24 * 60 },
    { key: 'LOW', firstResponseMinutes: 8 * 60, resolutionMinutes: 3 * 24 * 60 },
  ];

  await db.slaPolicy.create({
    data: {
      organizationId,
      name: 'Standard support',
      description: 'Default targets applied to every ticket that no other policy claims.',
      isDefault: true,
      conditions: { all: [], any: [] },
      businessHoursId: calendar?.id ?? null,
      warningMinutesBefore: 30,
      targets: {
        create: [
          ...targets
            .filter((target) => byKey.has(target.key))
            .map((target) => ({
              priorityId: byKey.get(target.key) ?? null,
              firstResponseMinutes: target.firstResponseMinutes,
              resolutionMinutes: target.resolutionMinutes,
              useBusinessHours: true,
            })),
          // Fallback for any priority the organization adds later.
          { priorityId: null, firstResponseMinutes: 4 * 60, resolutionMinutes: 2 * 24 * 60, useBusinessHours: true },
        ],
      },
    },
  });
}
