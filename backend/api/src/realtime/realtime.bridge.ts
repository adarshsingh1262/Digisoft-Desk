import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RealtimeGateway } from './realtime.gateway';

export const RT_BRIDGE_CHANNEL = 'rt:emit';

export interface RealtimeEnvelope {
  organizationId: string;
  userId?: string;
  /** Ticket audience rooms, so a worker-originated ticket event is scoped like an API one. */
  audience?: { departmentId: string | null; assignedAgentId: string | null };
  event: string;
  payload: unknown;
}

/**
 * Lets background workers push realtime events without owning a Socket.IO server:
 * they publish an envelope on Redis and the API instances fan it out to their sockets.
 */
@Injectable()
export class RealtimeBridge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeBridge.name);
  private subscriber?: Redis;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly gateway: RealtimeGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(RT_BRIDGE_CHANNEL);
    this.subscriber.on('message', (_channel, raw) => {
      try {
        const envelope = JSON.parse(raw) as RealtimeEnvelope;
        if (envelope.audience) {
          this.gateway.emitToTicketAudience(
            envelope.organizationId,
            envelope.audience,
            envelope.event,
            envelope.payload,
          );
        } else if (envelope.userId) {
          this.gateway.emitToUser(
            envelope.organizationId,
            envelope.userId,
            envelope.event,
            envelope.payload,
          );
        } else {
          this.gateway.emitToOrganization(
            envelope.organizationId,
            envelope.event,
            envelope.payload,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Discarded malformed realtime envelope: ${error instanceof Error ? error.message : error}`,
        );
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit();
  }
}
