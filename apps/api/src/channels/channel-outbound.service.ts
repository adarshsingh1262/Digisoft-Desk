import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { TenantPrismaClient } from '@digisoft/db';
import { providerFor } from '@digisoft/channels';
import type { AuthenticatedUser, ChannelType } from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { CHANNEL_QUEUE_TOKEN } from '../queue/queue.module';
import { CHANNEL_SEND_JOB, type ChannelSendJob } from '../queue/queue.constants';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ChannelSecretsService } from './channel-secrets.service';
import { CHAT_BRIDGE_CHANNEL, CHAT_EVENTS, chatRoom } from '../chat/chat.events';

/**
 * Outbound delivery. Sending happens in the worker so a slow or failing provider can
 * never hold up an agent's reply; this service decides *whether* a reply leaves the
 * product and hands the job over.
 */
@Injectable()
export class ChannelOutboundService {
  private readonly logger = new Logger(ChannelOutboundService.name);

  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    @Inject(CHANNEL_QUEUE_TOKEN) private readonly queue: Queue<ChannelSendJob>,
    private readonly secrets: ChannelSecretsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Called after an agent posts a public reply. A ticket that came in on a channel is
   * answered on that channel; one raised in the agent UI or the portal is not.
   */
  async deliverReply(organizationId: string, ticketId: string, messageId: string): Promise<void> {
    const ticket = await this.db.ticket.findFirst({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        channelId: true,
        channel: { select: { id: true, type: true, provider: true, isActive: true } },
        contact: { select: { id: true } },
      },
    });
    if (!ticket?.channel || !ticket.channel.isActive) {
      return;
    }

    if (ticket.channel.type === 'CHAT') {
      // Live chat is delivered over the visitor's own socket, not a provider API.
      const message = await this.db.ticketMessage.findFirst({
        where: { id: messageId },
        select: {
          id: true,
          bodyText: true,
          authorUser: { select: { firstName: true, lastName: true } },
        },
      });
      const session = await this.db.chatSession.findFirst({
        where: { ticketId: ticket.id },
        select: { id: true, status: true },
      });
      if (message && session) {
        if (session.status === 'QUEUED') {
          await this.db.chatSession.update({ where: { id: session.id }, data: { status: 'ACTIVE' } });
        }
        // Published rather than emitted directly, so it reaches the visitor's socket
        // whichever API instance is holding it.
        await this.redis.publish(
          CHAT_BRIDGE_CHANNEL,
          JSON.stringify({
            organizationId,
            room: chatRoom(session.id),
            event: CHAT_EVENTS.MESSAGE,
            payload: {
              sessionId: session.id,
              id: message.id,
              body: message.bodyText,
              author: message.authorUser
                ? `${message.authorUser.firstName} ${message.authorUser.lastName}`.trim()
                : 'Support',
              direction: 'OUTBOUND',
              createdAt: new Date().toISOString(),
            },
          }),
        );
      }
      return;
    }

    const identity = ticket.contact
      ? await this.db.channelIdentity.findFirst({
          where: { contactId: ticket.contact.id, type: ticket.channel.type },
          select: { externalId: true },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    const target = identity?.externalId;
    if (!target) {
      this.logger.warn(
        `Ticket ${ticket.ticketNumber} has no ${ticket.channel.type} identity to reply to`,
      );
      return;
    }

    await this.queue.add(
      CHANNEL_SEND_JOB,
      {
        organizationId,
        channelId: ticket.channel.id,
        ticketId: ticket.id,
        messageId,
        to: target,
      },
      { jobId: `send-${messageId}` },
    );
  }

  /** Configuration check from the channels screen — a real send, not a simulation. */
  async test(id: string, actor: AuthenticatedUser, to: string, text?: string) {
    const channel = await this.db.channel.findFirst({
      where: { id },
      select: { id: true, type: true, provider: true, secrets: true, config: true },
    });
    if (!channel) {
      throw AppError.notFound('channel');
    }
    const provider = providerFor(channel.type as ChannelType, channel.provider);
    if (!provider?.send) {
      throw AppError.validation(
        `${channel.type} channels do not send through this product; replies go out over the configured mail provider or the chat socket instead`,
      );
    }
    if (!to.trim()) {
      throw AppError.validation('Give an address, number or chat id to send the test to');
    }

    const result = await provider.send(
      {
        to: to.trim(),
        text: text?.trim() || `Test message from ${actor.firstName} — the channel is connected.`,
      },
      this.secrets.open(channel.secrets),
      (channel.config ?? {}) as Record<string, unknown>,
    );

    await this.db.channel.update({ where: { id }, data: { lastOutboundAt: new Date() } });
    return { sent: true, externalId: result.externalId };
  }
}
