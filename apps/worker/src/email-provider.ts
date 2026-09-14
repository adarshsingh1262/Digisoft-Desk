import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { createTransport } from 'nodemailer';
import type { WorkerEnv } from './config';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: OutboundEmail): Promise<string | null>;
}

export function createEmailProvider(env: WorkerEnv): EmailProvider {
  if (env.EMAIL_PROVIDER === 'smtp') {
    if (!env.SMTP_HOST || !env.SMTP_PORT) {
      throw new Error('EMAIL_PROVIDER=smtp requires SMTP_HOST and SMTP_PORT');
    }
    const transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    return {
      name: 'smtp',
      async send(message) {
        const info = await transporter.sendMail({ from: env.EMAIL_FROM, ...message });
        return info.messageId ?? null;
      },
    };
  }

  if (env.EMAIL_PROVIDER === 'ses') {
    if (!env.AWS_REGION) {
      throw new Error('EMAIL_PROVIDER=ses requires AWS_REGION');
    }
    const client = new SESv2Client({ region: env.AWS_REGION });
    return {
      name: 'ses',
      async send(message) {
        const result = await client.send(
          new SendEmailCommand({
            FromEmailAddress: env.EMAIL_FROM,
            Destination: { ToAddresses: [message.to] },
            ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
            Content: {
              Simple: {
                Subject: { Data: message.subject, Charset: 'UTF-8' },
                Body: {
                  Html: { Data: message.html, Charset: 'UTF-8' },
                  Text: { Data: message.text, Charset: 'UTF-8' },
                },
              },
            },
          }),
        );
        return result.MessageId ?? null;
      },
    };
  }

  return {
    name: 'console',
    send(message) {
      process.stdout.write(
        `[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}\n`,
      );
      return Promise.resolve(null);
    },
  };
}
