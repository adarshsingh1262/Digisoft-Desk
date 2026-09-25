import { createHmac } from 'node:crypto';
import type {
  ChannelConfig,
  ChannelProvider,
  ChannelSecrets,
  InboundMessage,
  ParseContext,
  VerifyInput,
} from '../types';
import { ChannelError } from '../types';
import { safeEqual } from '../crypto';

function record(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}
function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Twilio signs the absolute URL plus the sorted form fields. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((accumulator, key) => accumulator + key + params[key], url);
  return createHmac('sha1', authToken).update(Buffer.from(payload, 'utf8')).digest('base64');
}

/**
 * Telephony. A call is not a conversation, so an inbound event becomes a logged call
 * activity — with its recording when one exists — rather than a chat-style message.
 */
export const twilioVoiceProvider: ChannelProvider = {
  key: 'twilio',
  type: 'VOICE',

  verify(input: VerifyInput, secrets: ChannelSecrets): boolean {
    const authToken = secrets['authToken'];
    if (!authToken) {
      return false;
    }
    const provided = input.headers['x-twilio-signature'];
    const url = input.headers['x-digisoft-webhook-url'];
    if (!provided || !url) {
      return false;
    }
    let params: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(input.rawBody);
      params = Object.fromEntries(
        Object.entries(record(parsed)).map(([key, value]) => [key, String(value ?? '')]),
      );
    } catch {
      params = Object.fromEntries(new URLSearchParams(input.rawBody).entries());
    }
    return safeEqual(provided, twilioSignature(authToken, url, params));
  },

  parse(payload: unknown, _context: ParseContext): InboundMessage[] {
    const body = record(payload);
    const callSid = str(body['CallSid']);
    const from = str(body['From']);
    if (!callSid || !from) {
      return [];
    }

    const direction = str(body['Direction']) ?? 'inbound';
    const status = str(body['CallStatus']) ?? 'completed';
    const duration = str(body['CallDuration']) ?? str(body['RecordingDuration']);
    const recordingUrl = str(body['RecordingUrl']);
    const transcript = str(body['TranscriptionText']);

    return [
      {
        externalId: callSid,
        from: { externalId: from, phone: from, name: str(body['CallerName']) },
        to: str(body['To']),
        text:
          transcript ??
          `${direction.startsWith('inbound') ? 'Inbound' : 'Outbound'} call (${status})${
            duration ? `, ${duration}s` : ''
          }`,
        meta: {
          kind: 'call',
          callSid,
          direction: direction.startsWith('inbound') ? 'INBOUND' : 'OUTBOUND',
          status,
          durationSeconds: duration ? Number.parseInt(duration, 10) : undefined,
          recordingUrl,
        },
      },
    ];
  },
};

/** Places a call through Twilio; used by click-to-call from a ticket or a contact. */
export async function placeTwilioCall(
  secrets: ChannelSecrets,
  config: ChannelConfig,
  input: { to: string; from: string; answerUrl: string },
): Promise<{ callSid: string }> {
  const accountSid = secrets['accountSid'];
  const authToken = secrets['authToken'];
  if (!accountSid || !authToken) {
    throw new ChannelError('This voice channel needs an account SID and auth token');
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        To: input.to,
        From: input.from,
        Url: input.answerUrl,
        ...(typeof config['statusCallback'] === 'string'
          ? { StatusCallback: config['statusCallback'] }
          : {}),
      }).toString(),
    },
  );

  const body = record(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new ChannelError(
      `Twilio refused the call: ${str(body['message']) ?? response.statusText}`,
      response.status,
    );
  }
  const sid = str(body['sid']);
  if (!sid) {
    throw new ChannelError('Twilio accepted the call but returned no call id');
  }
  return { callSid: sid };
}
