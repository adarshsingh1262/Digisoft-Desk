import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { EmailMessage, EmailProvider, SentEmail } from '../email.types';

export class SesEmailProvider implements EmailProvider {
  readonly name = 'ses';
  private readonly client: SESv2Client;

  constructor(
    region: string,
    private readonly from: string,
  ) {
    // Credentials come from the standard AWS provider chain (env, profile, IAM role).
    this.client = new SESv2Client({ region });
  }

  async send(message: EmailMessage): Promise<SentEmail> {
    const result = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
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
    return { providerMessageId: result.MessageId ?? null };
  }
}
