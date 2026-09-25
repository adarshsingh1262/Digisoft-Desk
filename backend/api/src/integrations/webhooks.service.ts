import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma, TenantPrismaClient } from '@digisoft/db';
import type {
  AuthenticatedUser,
  ListWebhookDeliveriesQuery,
  UpdateWebhookEndpointInput,
  WebhookEndpointInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { pageMeta, toSkipTake } from '../common/dto/pagination';
import type { Paginated } from '../common/interceptors/response.interceptor';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

const ENDPOINT_SELECT = {
  id: true,
  name: true,
  url: true,
  events: true,
  isActive: true,
  lastSuccessAt: true,
  lastFailureAt: true,
  failureCount: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { deliveries: true } },
} as const;

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  list() {
    return this.db.webhookEndpoint.findMany({
      select: ENDPOINT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(actor: AuthenticatedUser, input: WebhookEndpointInput) {
    // The signing secret is returned once, at creation, and never again.
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const endpoint = await this.db.webhookEndpoint.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        url: input.url,
        events: input.events,
        isActive: input.isActive,
        secret,
      },
      select: ENDPOINT_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'webhook_endpoint.created',
      entity: 'WebhookEndpoint',
      entityId: endpoint.id,
      newValue: { name: endpoint.name, url: endpoint.url },
    });
    return { ...endpoint, secret };
  }

  async update(id: string, actor: AuthenticatedUser, input: UpdateWebhookEndpointInput) {
    await this.require(id);
    const endpoint = await this.db.webhookEndpoint.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.events !== undefined ? { events: input.events } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: ENDPOINT_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'webhook_endpoint.updated',
      entity: 'WebhookEndpoint',
      entityId: id,
      newValue: { name: endpoint.name, isActive: endpoint.isActive },
    });
    return endpoint;
  }

  async rotateSecret(id: string, actor: AuthenticatedUser) {
    await this.require(id);
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    await this.db.webhookEndpoint.update({ where: { id }, data: { secret } });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'webhook_endpoint.secret_rotated',
      entity: 'WebhookEndpoint',
      entityId: id,
    });
    return { secret };
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.require(id);
    await this.db.webhookEndpoint.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'webhook_endpoint.deleted',
      entity: 'WebhookEndpoint',
      entityId: id,
      oldValue: { name: existing.name },
    });
  }

  async deliveries(query: ListWebhookDeliveriesQuery): Promise<Paginated<unknown>> {
    const where: Prisma.WebhookDeliveryWhereInput = {
      ...(query.endpointId ? { endpointId: query.endpointId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.event ? { event: query.event } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.webhookDelivery.findMany({
        where,
        select: {
          id: true,
          event: true,
          status: true,
          attempts: true,
          responseStatus: true,
          error: true,
          deliveredAt: true,
          createdAt: true,
          endpoint: { select: { id: true, name: true, url: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.db.webhookDelivery.count({ where }),
    ]);
    return { items, meta: pageMeta(query, total) };
  }

  async replay(id: string, actor: AuthenticatedUser) {
    const delivery = await this.db.webhookDelivery.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!delivery) {
      throw AppError.notFound('delivery');
    }
    await this.dispatcher.replay(actor.organizationId, id);
    return { queued: true };
  }

  /** Sends a signed sample event so an integrator can wire up their receiver. */
  async test(id: string, actor: AuthenticatedUser) {
    const endpoint = await this.require(id);
    await this.dispatcher.dispatch(actor.organizationId, 'ticket.created', {
      test: true,
      endpointId: endpoint.id,
      message: 'This is a test delivery from Digisoft360 Help Desk',
      requestedBy: { id: actor.id, email: actor.email },
    });
    return { queued: true };
  }

  private async require(id: string) {
    const endpoint = await this.db.webhookEndpoint.findFirst({
      where: { id },
      select: { id: true, name: true },
    });
    if (!endpoint) {
      throw AppError.notFound('webhook endpoint');
    }
    return endpoint;
  }
}
