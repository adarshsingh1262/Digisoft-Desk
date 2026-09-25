import { createHmac } from 'node:crypto';
import type {
  ChannelConfig,
  ChannelProvider,
  ChannelSecrets,
  InboundMessage,
  OutboundMessage,
  ParseContext,
  VerifyInput,
} from '../types';
import { ChannelError } from '../types';
import { safeEqual } from '../crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';

function record(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}
function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** WhatsApp Cloud API: same signing scheme as the other Meta products. */
export const whatsappCloudProvider: ChannelProvider = {
  key: 'whatsapp_cloud',
  type: 'WHATSAPP',

  challenge(query, secrets) {
    const verifyToken = secrets['verifyToken'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (!verifyToken || token === undefined || !challenge) {
      return null;
    }
    return query['hub.mode'] === 'subscribe' && safeEqual(token, verifyToken) ? challenge : null;
  },

  verify(input: VerifyInput, secrets: ChannelSecrets): boolean {
    const appSecret = secrets['appSecret'];
    const header = input.headers['x-hub-signature-256'];
    if (!appSecret || !header) {
      return false;
    }
    const provided = header.split('=')[1];
    if (!provided) {
      return false;
    }
    const expected = createHmac('sha256', appSecret).update(input.rawBody).digest('hex');
    return safeEqual(provided, expected);
  },

  parse(payload: unknown, _context: ParseContext): InboundMessage[] {
    const body = record(payload);
    const messages: InboundMessage[] = [];

    for (const rawEntry of list(body['entry'])) {
      for (const rawChange of list(record(rawEntry)['changes'])) {
        const value = record(record(rawChange)['value']);
        const contacts = list(value['contacts']).map((contact) => record(contact));
        const metadata = record(value['metadata']);

        for (const rawMessage of list(value['messages'])) {
          const message = record(rawMessage);
          const id = str(message['id']);
          const from = str(message['from']);
          const text = str(record(message['text'])['body']) ?? str(record(message['button'])['text']);
          if (!id || !from || !text) {
            // Media-only messages are acknowledged; the text pipeline has nothing to store.
            continue;
          }
          const profile = record(contacts[0]?.['profile']);
          const timestamp = str(message['timestamp']);

          messages.push({
            externalId: id,
            from: { externalId: from, name: str(profile['name']), phone: `+${from}` },
            to: str(metadata['display_phone_number']),
            text,
            receivedAt: timestamp ? new Date(Number.parseInt(timestamp, 10) * 1000) : undefined,
            meta: { phoneNumberId: str(metadata['phone_number_id']) },
          });
        }
      }
    }

    return messages;
  },

  async send(
    message: OutboundMessage,
    secrets: ChannelSecrets,
    _config: ChannelConfig,
  ): Promise<{ externalId: string | null }> {
    const token = secrets['accessToken'];
    const phoneNumberId = secrets['phoneNumberId'];
    if (!token || !phoneNumberId) {
      throw new ChannelError('This WhatsApp channel needs an access token and a phone number id');
    }

    const response = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.to,
        type: 'text',
        text: { body: message.text, preview_url: false },
      }),
    });

    const body = record(await response.json().catch(() => ({})));
    if (!response.ok) {
      const error = record(body['error']);
      throw new ChannelError(
        `WhatsApp refused the message: ${str(error['message']) ?? response.statusText}`,
        response.status,
      );
    }
    const sent = record(list(body['messages'])[0]);
    return { externalId: str(sent['id']) ?? null };
  },
};
