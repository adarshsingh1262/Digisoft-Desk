import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Field definitions of the form every organization starts with. The shape is the one
 * `webFormFieldSchema` in @digisoft/shared validates; `mapsTo` decides which ticket
 * column a value lands in, and anything unmapped is stored in `customFields`.
 */
export const DEFAULT_WEB_FORM_FIELDS = [
  {
    key: 'name',
    label: 'Your name',
    type: 'TEXT',
    required: true,
    mapsTo: 'name',
    placeholder: 'Jane Doe',
  },
  {
    key: 'email',
    label: 'Email address',
    type: 'EMAIL',
    required: true,
    mapsTo: 'email',
    placeholder: 'jane@example.com',
  },
  { key: 'subject', label: 'Subject', type: 'TEXT', required: true, mapsTo: 'subject' },
  {
    key: 'description',
    label: 'How can we help?',
    type: 'TEXTAREA',
    required: true,
    mapsTo: 'description',
  },
] as const;

/** Portal address for an organization; falls back to a suffix when the slug is taken. */
export async function availableHelpCenterSlug(db: Db, preferred: string): Promise<string> {
  const base = preferred.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const candidate = base.length >= 2 ? base : 'help';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt === 0 ? candidate : `${candidate}-${attempt + 1}`;
    const taken = await db.helpCenter.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) {
      return slug;
    }
  }
  return `${candidate}-${Date.now().toString(36)}`;
}

/**
 * Creates the customer-facing site: the help center itself plus one knowledge base
 * category, one community category and the default contact form, so the portal is
 * usable the moment an organization is created.
 */
export async function provisionHelpCenter(
  db: Db,
  organizationId: string,
  input: { name: string; slug: string },
): Promise<void> {
  const existing = await db.helpCenter.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  const slug = await availableHelpCenterSlug(db, input.slug);

  await db.helpCenter.create({
    data: {
      organizationId,
      slug,
      name: `${input.name} Support`,
      tagline: 'Answers, guides and a way to reach us.',
      welcomeMessage: 'Search the knowledge base or open a request — we are here to help.',
    },
  });

  const department = await db.department.findFirst({
    where: { organizationId, isDefault: true },
    select: { id: true },
  });

  await db.kbCategory.create({
    data: {
      organizationId,
      name: 'Getting started',
      slug: 'getting-started',
      description: 'First steps, accounts and the basics.',
      position: 0,
    },
  });

  await db.communityCategory.create({
    data: {
      organizationId,
      name: 'General discussion',
      slug: 'general-discussion',
      description: 'Questions, ideas and conversations with other customers.',
      position: 0,
    },
  });

  await db.webForm.create({
    data: {
      organizationId,
      name: 'Contact support',
      slug: 'contact-support',
      description: 'Tell us what you need and we will get back to you.',
      departmentId: department?.id ?? null,
      fields: DEFAULT_WEB_FORM_FIELDS as unknown as Prisma.InputJsonValue,
    },
  });
}
