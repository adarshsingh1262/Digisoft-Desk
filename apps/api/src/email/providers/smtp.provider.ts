import { createTransport, type Transporter } from 'nodemailer';
import type { EmailMessage, EmailProvider, SentEmail } from '../email.types';

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transporter: Transporter;

  constructor(private readonly options: SmtpOptions) {
    this.transporter = createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: options.user ? { user: options.user, pass: options.password } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<SentEmail> {
    const info = await this.transporter.sendMail({
      from: this.options.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
      headers: message.headers,
    });
    return { providerMessageId: info.messageId ?? null };
  }
}
