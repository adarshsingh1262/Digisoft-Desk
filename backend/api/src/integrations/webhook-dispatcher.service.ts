import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Prisma, TenantPrismaClient } from '@digisoft/db';
import type { WebhookEvent } from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { WEBHOOK_QUEUE_TOKEN } from '../queue/queue.module';
import { WEBHOOK_DELIVER_JOB, type WebhookDeliveryJob } from '../queue/queue.constants';

/**
 * Fans a domain event out to the organization's subscribed endpoints. Each endpoint
 * gets its own delivery row and its own queued job, so one slow receiver cannot hold
 * up another and a single failure can be retried on its own.
 *
 * Dispatch never throws into the caller: an integration problem must not fail the
 * business operation that produced the event.
 */
@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    @Inject(WEBHOOK_QUEUE_TOKEN) private readonly queue: Queue<WebhookDeliveryJob>,
  ) {}

  async dispatch(
    organizationId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const endpoints = await this.db.webhookEndpoint.findMany({
        where: { isActive: true, OR: [{ events: { isEmpty: true } }, { events: { has: event } }] },
        select: { id: true },
      });
      if (endpoints.length === 0) {
        return;
      }

      const body = await this.enrich(payload);

      for (const endpoint of endpoints) {
        const delivery = await this.db.webhookDelivery.create({
          data: {
            organizationId,
            endpointId: endpoint.id,
            event,
            payload: body as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        await this.queue.add(WEBHOOK_DELIVER_JOB, { organizationId, deliveryId: delivery.id });
      }
    } catch (error) {
      this.logger.warn(
        `Could not dispatch ${event}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * A ticket event carries the ticket itself, not just its id: an integrator should not
   * need a second API call to know what changed.
   */
  private async enrich(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (payload['entity'] !== 'Ticket' || typeof payload['entityId'] !== 'string') {
      return payload;
    }
    const ticket = await this.db.ticket.findFirst({
      where: { id: payload['entityId'] },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        source: true,
        createdAt: true,
        updatedAt: true,
        status: { select: { id: true, name: true, isResolved: true, isClosed: true } },
        priority: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        assignedAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return ticket ? { ...payload, ticket } : payload;
  }

  /** Re-queues a delivery an operator wants to try again from the deliveries screen. */
  async replay(organizationId: string, deliveryId: string): Promise<void> {
    await this.db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'PENDING', error: null },
    });
    await this.queue.add(WEBHOOK_DELIVER_JOB, { organizationId, deliveryId });
  }
}
