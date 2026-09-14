import type { PrismaClient } from '@digisoft/db';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

/**
 * What the engine needs from its host. Both the API and the worker satisfy this with
 * an unscoped Prisma client, so every engine query names `organizationId` explicitly.
 */
export interface EngineDeps {
  prisma: PrismaClient;
  redis: Redis;
  /** The `email` queue; the worker's processor does the actual send. */
  emailQueue: Pick<Queue, 'add'>;
  log: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;
}

/** Same envelope the API's RealtimeBridge consumes on the `rt:emit` channel. */
export interface RealtimeEnvelope {
  organizationId: string;
  userId?: string;
  /** Ticket audience rooms; when present the bridge fans out like the API does. */
  audience?: { departmentId: string | null; assignedAgentId: string | null };
  event: string;
  payload: unknown;
}

export const RT_BRIDGE_CHANNEL = 'rt:emit';

export async function publishRealtime(deps: EngineDeps, envelope: RealtimeEnvelope): Promise<void> {
  await deps.redis.publish(RT_BRIDGE_CHANNEL, JSON.stringify(envelope));
}
