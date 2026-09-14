export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Present for channel messages that must thread (used from Phase 5 onwards). */
  headers?: Record<string, string>;
}

export interface SentEmail {
  providerMessageId: string | null;
}

/** Every outbound email goes through this interface, never a provider SDK directly. */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SentEmail>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
