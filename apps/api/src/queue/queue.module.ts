import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { QUEUE_NAMES } from './queue.constants';

export const EMAIL_QUEUE = Symbol('EMAIL_QUEUE');
export const NOTIFICATION_QUEUE = Symbol('NOTIFICATION_QUEUE');
export const AUTOMATION_QUEUE_TOKEN = Symbol('AUTOMATION_QUEUE');
export const SLA_QUEUE_TOKEN = Symbol('SLA_QUEUE');

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 86400 },
};

function queueFactory(name: string) {
  return (redis: Redis): Queue =>
    new Queue(name, { connection: redis.duplicate(), defaultJobOptions });
}

@Global()
@Module({
  providers: [
    { provide: EMAIL_QUEUE, inject: [REDIS_CLIENT], useFactory: queueFactory(QUEUE_NAMES.EMAIL) },
    {
      provide: NOTIFICATION_QUEUE,
      inject: [REDIS_CLIENT],
      useFactory: queueFactory(QUEUE_NAMES.NOTIFICATIONS),
    },
    {
      provide: AUTOMATION_QUEUE_TOKEN,
      inject: [REDIS_CLIENT],
      useFactory: queueFactory(QUEUE_NAMES.AUTOMATION),
    },
    { provide: SLA_QUEUE_TOKEN, inject: [REDIS_CLIENT], useFactory: queueFactory(QUEUE_NAMES.SLA) },
  ],
  exports: [EMAIL_QUEUE, NOTIFICATION_QUEUE, AUTOMATION_QUEUE_TOKEN, SLA_QUEUE_TOKEN],
})
export class QueueModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    // Queue connections are duplicated from the shared Redis client and closed with it.
  }
}
