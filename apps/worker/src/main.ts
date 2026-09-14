import { Worker, type Job } from 'bullmq';
import { PrismaClient } from '@digisoft/db';
import { Redis } from 'ioredis';
import pino from 'pino';
import { loadEnv } from './config';
import { createEmailProvider } from './email-provider';
import { handleSendEmail, type SendEmailJob } from './processors/send-email.processor';
import {
  handleDeliverNotification,
  type DeliverNotificationJob,
} from './processors/deliver-notification.processor';

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL, name: 'worker' });
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();
const emailProvider = createEmailProvider(env);

const emailWorker = new Worker<SendEmailJob>(
  'email',
  (job: Job<SendEmailJob>) => handleSendEmail(job, { emailProvider, logger }),
  { connection: connection.duplicate(), concurrency: env.WORKER_CONCURRENCY },
);

const notificationWorker = new Worker<DeliverNotificationJob>(
  'notifications',
  (job: Job<DeliverNotificationJob>) =>
    handleDeliverNotification(job, { prisma, redis: connection, logger }),
  { connection: connection.duplicate(), concurrency: env.WORKER_CONCURRENCY },
);

for (const worker of [emailWorker, notificationWorker]) {
  worker.on('failed', (job, error) => {
    logger.error(
      { queue: worker.name, jobId: job?.id, attempts: job?.attemptsMade },
      `Job failed: ${error.message}`,
    );
  });
  worker.on('completed', (job) => {
    logger.debug({ queue: worker.name, jobId: job.id }, 'Job completed');
  });
}

logger.info(`Worker started (email provider: ${emailProvider.name})`);

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, draining queues`);
  await Promise.all([emailWorker.close(), notificationWorker.close()]);
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
