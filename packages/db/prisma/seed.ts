/**
 * Development seed: provisions a demo organization with the five system roles, an
 * admin user, departments, accounts and contacts. Safe to re-run — it is a no-op if
 * the demo organization already exists.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { SYSTEM_ROLES } from '@digisoft/shared';
import { provisionSystemRoles, syncPermissionCatalogue } from '../src/role-provisioning';

const prisma = new PrismaClient();

const DEMO = {
  organizationName: 'Digisoft360 Demo',
  organizationSlug: 'demo',
  adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@digisoft360.local',
  adminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',
};

async function main(): Promise<void> {
  await syncPermissionCatalogue(prisma);

  const existing = await prisma.organization.findUnique({
    where: { slug: DEMO.organizationSlug },
    select: { id: true },
  });
  if (existing) {
    console.log(`Organization "${DEMO.organizationSlug}" already seeded — nothing to do.`);
    return;
  }

  const passwordHash = await argon2.hash(DEMO.adminPassword, { type: argon2.argon2id });

  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: DEMO.organizationName,
        slug: DEMO.organizationSlug,
        timezone: 'Asia/Kolkata',
      },
      select: { id: true },
    });

    const roleIds = await provisionSystemRoles(tx, organization.id);
    const superAdminRoleId = roleIds[SYSTEM_ROLES.SUPER_ADMIN];
    const agentRoleId = roleIds[SYSTEM_ROLES.AGENT];
    if (!superAdminRoleId || !agentRoleId) {
      throw new Error('System roles were not provisioned');
    }

    await tx.businessHours.create({
      data: {
        organizationId: organization.id,
        name: 'Default business hours',
        timezone: 'Asia/Kolkata',
        isDefault: true,
        weeklySchedule: [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '18:00' })),
      },
    });

    const support = await tx.department.create({
      data: {
        organizationId: organization.id,
        name: 'Customer Support',
        description: 'First line support.',
        isDefault: true,
      },
      select: { id: true },
    });

    await tx.department.create({
      data: {
        organizationId: organization.id,
        name: 'Technical Support',
        description: 'Escalated technical issues.',
      },
    });

    await tx.user.create({
      data: {
        organizationId: organization.id,
        email: DEMO.adminEmail,
        passwordHash,
        firstName: 'Demo',
        lastName: 'Admin',
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: superAdminRoleId } },
        departments: { create: { departmentId: support.id } },
      },
    });

    await tx.user.create({
      data: {
        organizationId: organization.id,
        email: 'agent@digisoft360.local',
        passwordHash,
        firstName: 'Demo',
        lastName: 'Agent',
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: agentRoleId } },
        departments: { create: { departmentId: support.id } },
      },
    });

    const account = await tx.account.create({
      data: {
        organizationId: organization.id,
        name: 'Northwind Traders',
        website: 'https://example.com',
        industry: 'Retail',
        city: 'Pune',
        country: 'India',
      },
      select: { id: true },
    });

    await tx.contact.createMany({
      data: [
        {
          organizationId: organization.id,
          accountId: account.id,
          firstName: 'Asha',
          lastName: 'Menon',
          email: 'asha.menon@example.com',
          jobTitle: 'Operations Lead',
          isVip: true,
        },
        {
          organizationId: organization.id,
          accountId: account.id,
          firstName: 'Rahul',
          lastName: 'Verma',
          email: 'rahul.verma@example.com',
          jobTitle: 'IT Administrator',
        },
      ],
    });
  });

  console.log(`Seeded organization "${DEMO.organizationSlug}".`);
  console.log(`  Admin: ${DEMO.adminEmail} / ${DEMO.adminPassword}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
