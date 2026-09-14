import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { createTransport } from 'nodemailer';
import type { WorkerEnv } from './config';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Overrides the deployment default so a channel can answer from its own address. */
  from?: string;
  /** Threading headers (Message-ID, In-Reply-To, References) for channel replies. */
  headers?: Record<string, string>;
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
        const info = await transporter.sendMail({
          from: message.from ?? env.EMAIL_FROM,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo: message.replyTo,
          headers: message.headers,
        });
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
            FromEmailAddress: message.from ?? env.EMAIL_FROM,
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
        `[email] from=${message.from ?? env.EMAIL_FROM} to=${message.to} subject=${JSON.stringify(
          message.subject,
        )}${message.headers ? ` headers=${JSON.stringify(message.headers)}` : ''}\n${message.text}\n`,
      );
      // The console provider still returns the Message-ID the caller set, so threading
      // can be exercised end to end without a mail server.
      return Promise.resolve(message.headers?.['Message-ID'] ?? null);
    },
  };
}
