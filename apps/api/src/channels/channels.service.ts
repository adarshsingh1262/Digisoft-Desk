import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, TenantPrismaClient } from '@digisoft/db';
import { providerFor, supportsOutbound } from '@digisoft/channels';
import {
  CHANNEL_PROVIDERS,
  type AuthenticatedUser,
  type ChannelInput,
  type ChannelType,
  type ListChannelEventsQuery,
  type ListChannelsQuery,
  type UpdateChannelInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/config.module';
import { pageMeta, toSkipTake } from '../common/dto/pagination';
import type { Paginated } from '../common/interceptors/response.interceptor';
import { ChannelSecretsService } from './channel-secrets.service';

const CHANNEL_SELECT = {
  id: true,
  type: true,
  provider: true,
  name: true,
  identifier: true,
  isActive: true,
  config: true,
  departmentId: true,
  priorityId: true,
  categoryId: true,
  lastInboundAt: true,
  lastOutboundAt: true,
  lastErrorAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } },
  priority: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true } },
  _count: { select: { events: true } },
} as const;

type ChannelRow = Prisma.ChannelGetPayload<{ select: typeof CHANNEL_SELECT }> & {
  secrets?: string | null;
  webhookSecret?: string | null;
};

@Injectable()
export class ChannelsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly secrets: ChannelSecretsService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  async list(query: ListChannelsQuery) {
    const channels = await this.db.channel.findMany({
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      },
      select: { ...CHANNEL_SELECT, secrets: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return channels.map((channel) => this.present(channel));
  }

  async findById(id: string) {
    const channel = await this.db.channel.findFirst({
      where: { id },
      select: { ...CHANNEL_SELECT, secrets: true },
    });
    if (!channel) {
      throw AppError.notFound('channel');
    }
    return this.present(channel);
  }

  async create(actor: AuthenticatedUser, input: ChannelInput) {
    this.assertProvider(input.type, input.provider);
    await this.assertReferencesExist(input);

    const webhookSecret = ChannelSecretsService.newWebhookSecret();
    const channel = await this.db.channel.create({
      data: {
        organizationId: actor.organizationId,
        type: input.type,
        provider: input.provider,
        name: input.name,
        identifier: input.identifier ?? null,
        isActive: input.isActive,
        config: input.config as Prisma.InputJsonValue,
        secrets: this.secrets.seal(null, input.secrets),
        webhookSecret,
        departmentId: input.departmentId ?? null,
        priorityId: input.priorityId ?? null,
        categoryId: input.categoryId ?? null,
      },
      select: { ...CHANNEL_SELECT, secrets: true },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'channel.created',
      entity: 'Channel',
      entityId: channel.id,
      newValue: { type: channel.type, provider: channel.provider, name: channel.name },
    });

    // The webhook secret is part of the URL and is shown exactly once.
    return { ...this.present(channel), webhookUrl: this.webhookUrl(channel.id, webhookSecret) };
  }

  async update(id: string, actor: AuthenticatedUser, input: UpdateChannelInput) {
    const existing = await this.require(id);
    if (input.provider) {
      this.assertProvider(existing.type, input.provider);
    }
    await this.assertReferencesExist(input);

    const channel = await this.db.channel.update({
      where: { id },
      data: {
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.identifier !== undefined ? { identifier: input.identifier } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.config !== undefined ? { config: input.config as Prisma.InputJsonValue } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        ...(input.priorityId !== undefined ? { priorityId: input.priorityId } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.secrets ? { secrets: this.secrets.seal(existing.secrets, input.secrets) } : {}),
      },
      select: { ...CHANNEL_SELECT, secrets: true },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'channel.updated',
      entity: 'Channel',
      entityId: id,
      oldValue: { name: existing.name, isActive: existing.isActive },
      newValue: { name: channel.name, isActive: channel.isActive },
    });
    return this.present(channel);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.require(id);
    await this.db.channel.update({
      where: { id },
      // Deactivated as well as deleted: a soft-deleted channel must stop accepting posts.
      data: { deletedAt: new Date(), isActive: false, identifier: null },
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'channel.deleted',
      entity: 'Channel',
      entityId: id,
      oldValue: { name: existing.name, type: existing.type },
    });
  }

  /** Rotates the URL secret; the old webhook URL stops working immediately. */
  async rotateWebhookSecret(id: string, actor: AuthenticatedUser) {
    await this.require(id);
    const webhookSecret = ChannelSecretsService.newWebhookSecret();
    await this.db.channel.update({ where: { id }, data: { webhookSecret } });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'channel.webhook_rotated',
      entity: 'Channel',
      entityId: id,
    });
    return { webhookUrl: this.webhookUrl(id, webhookSecret) };
  }

  async events(query: ListChannelEventsQuery): Promise<Paginated<unknown>> {
    const where: Prisma.ChannelEventWhereInput = {
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.channelEvent.findMany({
        where,
        select: {
          id: true,
          externalId: true,
          status: true,
          error: true,
          ticketId: true,
          messageId: true,
          processedAt: true,
          createdAt: true,
          channel: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.db.channelEvent.count({ where }),
    ]);
    return { items, meta: pageMeta(query, total) };
  }

  webhookUrl(channelId: string, secret: string): string {
    const base = this.config.get('PUBLIC_API_URL') ?? this.config.get('BACKEND_URL');
    return `${base.replace(/\/$/, '')}/${this.config.get('API_PREFIX')}/webhooks/${channelId}/${secret}`;
  }

  private present(channel: ChannelRow) {
    const { secrets, ...rest } = channel;
    return {
      ...rest,
      // Names only: the values never leave this service.
      configuredSecrets: this.secrets.names(secrets ?? null),
      canSend: supportsOutbound(channel.type, channel.provider),
    };
  }

  private async require(id: string) {
    const channel = await this.db.channel.findFirst({
      where: { id },
      select: { id: true, name: true, type: true, provider: true, isActive: true, secrets: true },
    });
    if (!channel) {
      throw AppError.notFound('channel');
    }
    return channel;
  }

  private assertProvider(type: ChannelType, provider: string): void {
    const allowed = CHANNEL_PROVIDERS[type] as readonly string[];
    if (!allowed.includes(provider) || !providerFor(type, provider)) {
      throw AppError.validation(
        `${provider} is not a ${type} provider. Available: ${allowed.join(', ')}`,
      );
    }
  }

  private async assertReferencesExist(input: Partial<ChannelInput>): Promise<void> {
    if (input.departmentId) {
      const department = await this.db.department.findFirst({
        where: { id: input.departmentId },
        select: { id: true },
      });
      if (!department) throw AppError.validation('The selected department does not exist');
    }
    if (input.priorityId) {
      const priority = await this.db.ticketPriority.findFirst({
        where: { id: input.priorityId },
        select: { id: true },
      });
      if (!priority) throw AppError.validation('The selected priority does not exist');
    }
    if (input.categoryId) {
      const category = await this.db.ticketCategory.findFirst({
        where: { id: input.categoryId },
        select: { id: true },
      });
      if (!category) throw AppError.validation('The selected category does not exist');
    }
  }
}
