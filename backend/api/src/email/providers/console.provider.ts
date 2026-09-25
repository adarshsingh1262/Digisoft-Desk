import { Logger } from '@nestjs/common';
import type { EmailMessage, EmailProvider, SentEmail } from '../email.types';

/** Development provider: writes the message to the log instead of sending it. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  send(message: EmailMessage): Promise<SentEmail> {
    this.logger.log(
      `[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
    );
    return Promise.resolve({ providerMessageId: null });
  }
}
