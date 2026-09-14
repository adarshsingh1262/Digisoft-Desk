import type { Prisma, PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from '@digisoft/shared';

type Db = PrismaClient | Prisma.TransactionClient;

const SYSTEM_ROLE_LABELS: Record<string, { name: string; description: string }> = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Full control over the organization, its settings and its users.',
  },
  ADMIN: {
    name: 'Admin',
    description: 'Manages support operations, users and configuration.',
  },
  AGENT: {
    name: 'Agent',
    description: 'Works on tickets and customer records.',
  },
  LIGHT_AGENT: {
    name: 'Light Agent',
    description: 'Read-only collaborator with limited support access.',
  },
  CUSTOMER: {
    name: 'Customer',
    description: 'End user of the help center and customer portal.',
  },
};

/** Upserts the global permission catalogue. Idempotent; safe to run on every boot. */
export async function syncPermissionCatalogue(db: Db): Promise<void> {
  for (const key of ALL_PERMISSIONS) {
    const [resource, action] = key.split('.') as [string, string];
    await db.permission.upsert({
      where: { key },
      create: { key, resource, action },
      update: { resource, action },
    });
  }
}

/** Creates the five system roles for a freshly provisioned organization. */
export async function provisionSystemRoles(
  db: Db,
  organizationId: string,
): Promise<Record<string, string>> {
  const permissions = await db.permission.findMany({ select: { id: true, key: true } });
  const permissionIdByKey = new Map(permissions.map((p) => [p.key, p.id]));
  const roleIdByKey: Record<string, string> = {};

  for (const systemKey of Object.values(SYSTEM_ROLES)) {
    const labels = SYSTEM_ROLE_LABELS[systemKey];
    const role = await db.role.create({
      data: {
        organizationId,
        systemKey,
        name: labels?.name ?? systemKey,
        description: labels?.description ?? null,
        isSystem: true,
        permissions: {
          create: SYSTEM_ROLE_PERMISSIONS[systemKey]
            .map((key) => permissionIdByKey.get(key))
            .filter((id): id is string => Boolean(id))
            .map((permissionId) => ({ permissionId })),
        },
      },
      select: { id: true },
    });
    roleIdByKey[systemKey] = role.id;
  }

  return roleIdByKey;
}

export const DEFAULT_BUSINESS_HOURS = {
  name: 'Default business hours',
  weeklySchedule: [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '18:00' })),
};
