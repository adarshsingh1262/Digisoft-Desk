export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  AUTOMATION: 'automation',
  SLA: 'sla',
  CHANNEL: 'channel',
  WEBHOOK: 'webhook',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const EMAIL_JOB = 'send-email';
export const NOTIFICATION_JOB = 'deliver-notification';
export const CHANNEL_SEND_JOB = 'channel-send';
export const WEBHOOK_DELIVER_JOB = 'webhook-deliver';

/** An agent reply leaving over the channel the ticket arrived on. */
export interface ChannelSendJob {
  organizationId: string;
  channelId: string;
  ticketId: string;
  messageId: string;
  to: string;
}

/** One attempt to hand an event to a customer's HTTP endpoint. */
export interface WebhookDeliveryJob {
  organizationId: string;
  deliveryId: string;
}

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
