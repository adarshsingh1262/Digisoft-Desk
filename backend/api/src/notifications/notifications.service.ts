import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@digisoft/db';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import type { TenantPrismaClient } from '@digisoft/db';
import { RealtimeGateway, RT_EVENTS } from '../realtime/realtime.gateway';
import { pageMeta, toSkipTake } from '../common/dto/pagination';
import type { Paginated } from '../common/interceptors/response.interceptor';

export interface CreateNotification {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(
    userId: string,
    query: { page: number; pageSize: number; unreadOnly?: boolean },
  ): Promise<Paginated<unknown>> {
    const where = { userId, ...(query.unreadOnly ? { readAt: null } : {}) };
    const [items, total] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.db.notification.count({ where }),
    ]);
    return { items, meta: pageMeta(query, total) };
  }

  countUnread(userId: string): Promise<number> {
    return this.db.notification.count({ where: { userId, readAt: null } });
  }

  async create(organizationId: string, input: CreateNotification) {
    const notification = await this.db.notification.create({
      data: {
        organizationId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        data: input.data ? (input.data as Prisma.InputJsonValue) : undefined,
      },
    });

    this.realtime.emitToUser(
      organizationId,
      input.userId,
      RT_EVENTS.NOTIFICATION_CREATED,
      notification,
    );
    return notification;
  }

  async markRead(id: string, userId: string) {
    // userId in the filter stops one agent marking another agent's notification.
    await this.db.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true };
  }

  async markAllRead(userId: string) {
    const result = await this.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: result.count };
  }
}
