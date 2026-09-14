import { Queue, Worker, type Job } from 'bullmq';
import { AUTOMATION_QUEUE, SLA_QUEUE, SLA_SCAN_JOB, type EngineDeps, type TriggerJob } from '@digisoft/engine';
import { handleAutomation } from './processors/automation.processor';
import { handleSlaScan } from './processors/sla.processor';
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
import { handleChannelSend, type ChannelSendJob } from './processors/channel-send.processor';
import { handleWebhookDelivery, type WebhookDeliveryJob } from './processors/webhook.processor';

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL, name: 'worker' });
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();
const emailProvider = createEmailProvider(env);

const emailQueue = new Queue('email', { connection: connection.duplicate() });
const automationQueue = new Queue<TriggerJob>(AUTOMATION_QUEUE, { connection: connection.duplicate() });
const slaQueue = new Queue(SLA_QUEUE, { connection: connection.duplicate() });

const engineDeps: EngineDeps = {
  prisma,
  redis: connection,
  emailQueue,
  log: (level, message, meta) => logger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](meta ?? {}, message),
};

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

const automationWorker = new Worker<TriggerJob>(
  AUTOMATION_QUEUE,
  (job: Job<TriggerJob>) => handleAutomation(job, engineDeps),
  { connection: connection.duplicate(), concurrency: env.WORKER_CONCURRENCY },
);

const channelWorker = new Worker<ChannelSendJob>(
  'channel',
  (job: Job<ChannelSendJob>) =>
    handleChannelSend(job, {
      prisma,
      logger,
      sendEmail: (message) => emailProvider.send(message),
      encryptionKey: env.CHANNEL_ENCRYPTION_KEY,
    }),
  { connection: connection.duplicate(), concurrency: env.WORKER_CONCURRENCY },
);

const webhookWorker = new Worker<WebhookDeliveryJob>(
  'webhook',
  (job: Job<WebhookDeliveryJob>) =>
    handleWebhookDelivery(job, { prisma, logger, maxAttempts: env.WEBHOOK_MAX_ATTEMPTS }),
  { connection: connection.duplicate(), concurrency: env.WORKER_CONCURRENCY },
);

const slaWorker = new Worker(
  SLA_QUEUE,
  () => handleSlaScan(engineDeps, automationQueue),
  // One sweep at a time: the scan is idempotent but there is no reason to overlap it.
  { connection: connection.duplicate(), concurrency: 1 },
);

// A repeatable job keyed by name: adding it again on every boot is a no-op.
void slaQueue.add(SLA_SCAN_JOB, {}, {
  repeat: { every: env.SLA_SCAN_INTERVAL_SECONDS * 1000 },
  jobId: 'sla-scan',
  removeOnComplete: true,
  removeOnFail: 10,
});

for (const worker of [
  emailWorker,
  notificationWorker,
  automationWorker,
  slaWorker,
  channelWorker,
  webhookWorker,
]) {
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
  await Promise.all([emailWorker.close(), notificationWorker.close(), automationWorker.close(), slaWorker.close()]);
  await Promise.all([emailQueue.close(), automationQueue.close(), slaQueue.close()]);
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
