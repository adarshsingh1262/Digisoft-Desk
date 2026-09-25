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
function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `hub.challenge` handshake shared by every Meta product. */
function metaChallenge(
  query: Record<string, string | undefined>,
  secrets: ChannelSecrets,
): string | null {
  const verifyToken = secrets['verifyToken'];
  if (!verifyToken) {
    return null;
  }
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token !== undefined && safeEqual(token, verifyToken) && challenge) {
    return challenge;
  }
  return null;
}

/** `X-Hub-Signature-256: sha256=<hmac of the raw body with the app secret>`. */
function metaVerify(input: VerifyInput, secrets: ChannelSecrets): boolean {
  const appSecret = secrets['appSecret'];
  if (!appSecret) {
    return false;
  }
  const header = input.headers['x-hub-signature-256'] ?? input.headers['x-hub-signature'];
  if (!header) {
    return false;
  }
  const [algorithm, provided] = header.split('=');
  if (!provided) {
    return false;
  }
  const expected = createHmac(algorithm === 'sha1' ? 'sha1' : 'sha256', appSecret)
    .update(input.rawBody)
    .digest('hex');
  return safeEqual(provided, expected);
}

/** Messenger and Instagram share one webhook envelope; only the `object` differs. */
function parseMessaging(payload: unknown): InboundMessage[] {
  const body = record(payload);
  const messages: InboundMessage[] = [];

  for (const rawEntry of list(body['entry'])) {
    const entry = record(rawEntry);
    for (const rawEvent of list(entry['messaging'])) {
      const event = record(rawEvent);
      const message = record(event['message']);
      const sender = record(event['sender']);
      const recipient = record(event['recipient']);
      const senderId = str(sender['id']);
      const text = str(message['text']);
      const mid = str(message['mid']);

      // Echoes are our own outbound messages coming back; delivery and read receipts
      // carry no conversation.
      if (!senderId || !text || !mid || message['is_echo'] === true) {
        continue;
      }

      messages.push({
        externalId: mid,
        from: { externalId: senderId },
        to: str(recipient['id']),
        text,
        receivedAt: num(event['timestamp']) ? new Date(num(event['timestamp'])!) : undefined,
        attachments: list(message['attachments'])
          .map((rawAttachment) => {
            const attachment = record(rawAttachment);
            const url = str(record(attachment['payload'])['url']);
            if (!url) return null;
            const type = str(attachment['type']) ?? 'file';
            return {
              fileName: url.split('/').pop()?.split('?')[0] ?? `${type}-attachment`,
              mimeType: type === 'image' ? 'image/jpeg' : 'application/octet-stream',
              url,
            };
          })
          .filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== null),
      });
    }
  }

  return messages;
}

async function sendToGraph(
  path: string,
  message: OutboundMessage,
  secrets: ChannelSecrets,
): Promise<{ externalId: string | null }> {
  const token = secrets['pageAccessToken'];
  if (!token) {
    throw new ChannelError('This channel has no page access token configured');
  }
  const response = await fetch(`${GRAPH}/${path}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: message.to },
      messaging_type: 'RESPONSE',
      message: { text: message.text },
    }),
  });
  const body = record(await response.json().catch(() => ({})));
  if (!response.ok) {
    const error = record(body['error']);
    throw new ChannelError(
      `Meta refused the message: ${str(error['message']) ?? response.statusText}`,
      response.status,
    );
  }
  return { externalId: str(body['message_id']) ?? null };
}

/** Facebook Messenger. */
export const messengerProvider: ChannelProvider = {
  key: 'meta',
  type: 'FACEBOOK',
  challenge: metaChallenge,
  verify: metaVerify,
  parse: (payload: unknown, _context: ParseContext) => parseMessaging(payload),
  send: (message, secrets, _config: ChannelConfig) => sendToGraph('me/messages', message, secrets),
};

/** Instagram direct messages — same envelope, same Graph endpoint. */
export const instagramProvider: ChannelProvider = {
  ...messengerProvider,
  type: 'INSTAGRAM',
};
