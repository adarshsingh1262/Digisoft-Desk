import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@digisoft/db';
import type {
  AuthenticatedUser,
  CreateContactInput,
  ListContactsQuery,
  UpdateContactInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import type { TenantPrismaClient } from '@digisoft/db';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { orderBy, pageMeta, toSkipTake } from '../common/dto/pagination';
import type { Paginated } from '../common/interceptors/response.interceptor';

const SORTABLE = ['createdAt', 'updatedAt', 'lastName', 'firstName', 'email'] as const;

const LIST_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  mobile: true,
  jobTitle: true,
  status: true,
  isVip: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ContactsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListContactsQuery): Promise<Paginated<unknown>> {
    const where: Prisma.ContactWhereInput = {
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isVip !== undefined ? { isVip: query.isVip } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.db.contact.findMany({
        where,
        select: LIST_FIELDS,
        orderBy: orderBy(query.sort, SORTABLE, query.order, 'createdAt'),
        ...toSkipTake(query),
      }),
      this.db.contact.count({ where }),
    ]);

    return { items, meta: pageMeta(query, total) };
  }

  async findById(id: string) {
    const contact = await this.db.contact.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, website: true, industry: true } },
      },
    });
    if (!contact || contact.deletedAt) {
      throw AppError.notFound('contact');
    }
    return contact;
  }

  async create(actor: AuthenticatedUser, input: CreateContactInput) {
    await this.assertAccountExists(input.accountId);

    if (input.email) {
      const existing = await this.db.contact.findFirst({
        where: { email: input.email },
        select: { id: true },
      });
      if (existing) {
        throw AppError.conflict('A contact with this email already exists', 'EMAIL_ALREADY_EXISTS');
      }
    }

    const contact = await this.db.contact.create({
      data: {
        organizationId: actor.organizationId,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        mobile: input.mobile ?? null,
        jobTitle: input.jobTitle ?? null,
        accountId: input.accountId ?? null,
        status: input.status,
        isVip: input.isVip,
        customFields: (input.customFields as Prisma.InputJsonValue) ?? undefined,
      },
      select: LIST_FIELDS,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'contact.created',
      entity: 'Contact',
      entityId: contact.id,
      newValue: contact,
    });
    return contact;
  }

  async update(id: string, actor: AuthenticatedUser, input: UpdateContactInput) {
    const before = await this.findById(id);
    if (input.accountId !== undefined) {
      await this.assertAccountExists(input.accountId);
    }

    const contact = await this.db.contact.update({
      where: { id },
      data: {
        ...input,
        customFields: (input.customFields as Prisma.InputJsonValue) ?? undefined,
      },
      select: LIST_FIELDS,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'contact.updated',
      entity: 'Contact',
      entityId: id,
      oldValue: before,
      newValue: contact,
    });
    return contact;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.findById(id);
    await this.db.contact.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'contact.deleted',
      entity: 'Contact',
      entityId: id,
    });
  }

  private async assertAccountExists(accountId: string | null | undefined): Promise<void> {
    if (!accountId) {
      return;
    }
    const account = await this.db.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) {
      throw AppError.notFound('account');
    }
  }
}
