export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  AUTOMATION: 'automation',
  SLA: 'sla',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const EMAIL_JOB = 'send-email';
export const NOTIFICATION_JOB = 'deliver-notification';

export interface SendEmailJob {
  organizationId: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface DeliverNotificationJob {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
}
