import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@digisoft/db';
import type {
  AuthenticatedUser,
  CreateAccountInput,
  ListAccountsQuery,
  UpdateAccountInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import type { TenantPrismaClient } from '@digisoft/db';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { orderBy, pageMeta, toSkipTake } from '../common/dto/pagination';
import type { Paginated } from '../common/interceptors/response.interceptor';

const SORTABLE = ['createdAt', 'updatedAt', 'name'] as const;

const LIST_FIELDS = {
  id: true,
  name: true,
  website: true,
  industry: true,
  phone: true,
  email: true,
  city: true,
  country: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { contacts: true } },
} as const;

@Injectable()
export class AccountsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAccountsQuery): Promise<Paginated<unknown>> {
    const where: Prisma.AccountWhereInput = {
      ...(query.industry ? { industry: query.industry } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { website: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.db.account.findMany({
        where,
        select: LIST_FIELDS,
        orderBy: orderBy(query.sort, SORTABLE, query.order, 'createdAt'),
        ...toSkipTake(query),
      }),
      this.db.account.count({ where }),
    ]);

    return { items, meta: pageMeta(query, total) };
  }

  async findById(id: string) {
    const account = await this.db.account.findUnique({ where: { id } });
    if (!account || account.deletedAt) {
      throw AppError.notFound('account');
    }
    return account;
  }

  async listContacts(accountId: string) {
    await this.findById(accountId);
    return this.db.contact.findMany({
      where: { accountId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        jobTitle: true,
        isVip: true,
      },
      orderBy: { firstName: 'asc' },
    });
  }

  async create(actor: AuthenticatedUser, input: CreateAccountInput) {
    const { customFields, ...rest } = input;
    const account = await this.db.account.create({
      data: {
        ...rest,
        organizationId: actor.organizationId,
        customFields: (customFields as Prisma.InputJsonValue) ?? undefined,
      },
      select: LIST_FIELDS,
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'account.created',
      entity: 'Account',
      entityId: account.id,
      newValue: account,
    });
    return account;
  }

  async update(id: string, actor: AuthenticatedUser, input: UpdateAccountInput) {
    const before = await this.findById(id);
    const { customFields, ...rest } = input;
    const account = await this.db.account.update({
      where: { id },
      data: {
        ...rest,
        customFields: (customFields as Prisma.InputJsonValue) ?? undefined,
      },
      select: LIST_FIELDS,
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'account.updated',
      entity: 'Account',
      entityId: id,
      oldValue: before,
      newValue: account,
    });
    return account;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.findById(id);
    await this.db.$transaction(async (tx) => {
      await tx.contact.updateMany({ where: { accountId: id }, data: { accountId: null } });
      await tx.account.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'account.deleted',
      entity: 'Account',
      entityId: id,
    });
  }
}
