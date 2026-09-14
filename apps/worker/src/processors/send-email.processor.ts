import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import type { EmailProvider } from '../email-provider';

export interface SendEmailJob {
  organizationId: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/**
 * Sends one transactional email. Idempotent enough for at-least-once delivery: a
 * retry can duplicate a message, which is preferable to dropping a password reset.
 */
export async function handleSendEmail(
  job: Job<SendEmailJob>,
  deps: { emailProvider: EmailProvider; logger: Logger },
): Promise<{ providerMessageId: string | null }> {
  const { to, subject, html, text, replyTo } = job.data;
  const providerMessageId = await deps.emailProvider.send({ to, subject, html, text, replyTo });

  deps.logger.info(
    { jobId: job.id, organizationId: job.data.organizationId, providerMessageId },
    `Email sent to ${to}`,
  );
  return { providerMessageId };
}
