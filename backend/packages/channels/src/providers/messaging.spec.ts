import { createHmac } from 'node:crypto';
import { telegramProvider } from './telegram';
import { instagramProvider, messengerProvider } from './meta';
import { whatsappCloudProvider } from './whatsapp';
import { twilioSignature, twilioVoiceProvider } from './voice';
import { providerFor, supportsOutbound } from '../registry';

const context = { identifier: null, config: {} };

describe('telegram', () => {
  it('checks the secret token when one is configured', () => {
    const secrets = { secretToken: 'abc' };
    expect(
      telegramProvider.verify(
        { rawBody: '{}', headers: { 'x-telegram-bot-api-secret-token': 'abc' }, query: {} },
        secrets,
      ),
    ).toBe(true);
    expect(
      telegramProvider.verify(
        { rawBody: '{}', headers: { 'x-telegram-bot-api-secret-token': 'wrong' }, query: {} },
        secrets,
      ),
    ).toBe(false);
    expect(telegramProvider.verify({ rawBody: '{}', headers: {}, query: {} }, {})).toBe(true);
  });

  it('maps a text update and ignores one without text', () => {
    const [message] = telegramProvider.parse(
      {
        update_id: 99,
        message: {
          message_id: 5,
          date: 1_780_000_000,
          chat: { id: 4242 },
          from: { first_name: 'Rhea', last_name: 'Kapoor', username: 'rhea' },
          text: 'My order never arrived',
        },
      },
      context,
    );
    expect(message).toMatchObject({
      externalId: 'telegram:99',
      from: { externalId: '4242', name: 'Rhea Kapoor' },
      text: 'My order never arrived',
    });

    expect(
      telegramProvider.parse({ update_id: 100, message: { message_id: 6, chat: { id: 1 } } }, context),
    ).toEqual([]);
  });
});

describe('meta messenger and instagram', () => {
  const appSecret = 'app-secret';
  const body = {
    object: 'page',
    entry: [
      {
        messaging: [
          {
            sender: { id: 'PSID-1' },
            recipient: { id: 'PAGE-1' },
            timestamp: 1_780_000_000_000,
            message: { mid: 'mid-1', text: 'Is the store open today?' },
          },
          {
            sender: { id: 'PAGE-1' },
            recipient: { id: 'PSID-1' },
            message: { mid: 'mid-echo', text: 'our own reply', is_echo: true },
          },
        ],
      },
    ],
  };

  it('verifies the payload signature', () => {
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    expect(
      messengerProvider.verify(
        { rawBody, headers: { 'x-hub-signature-256': `sha256=${signature}` }, query: {} },
        { appSecret },
      ),
    ).toBe(true);
    expect(
      messengerProvider.verify(
        { rawBody, headers: { 'x-hub-signature-256': 'sha256=deadbeef' }, query: {} },
        { appSecret },
      ),
    ).toBe(false);
  });

  it('answers the subscription challenge only with the right verify token', () => {
    const query = { 'hub.mode': 'subscribe', 'hub.verify_token': 'vt', 'hub.challenge': '12345' };
    expect(messengerProvider.challenge?.(query, { verifyToken: 'vt' })).toBe('12345');
    expect(messengerProvider.challenge?.(query, { verifyToken: 'other' })).toBeNull();
  });

  it('maps inbound messages and skips our own echoes', () => {
    const messages = messengerProvider.parse(body, context);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      externalId: 'mid-1',
      from: { externalId: 'PSID-1' },
      text: 'Is the store open today?',
    });
  });

  it('shares the envelope with instagram', () => {
    expect(instagramProvider.type).toBe('INSTAGRAM');
    expect(instagramProvider.parse(body, context)).toHaveLength(1);
  });
});

describe('whatsapp cloud', () => {
  const appSecret = 'wa-secret';
  const body = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { display_phone_number: '15550001111', phone_number_id: '1234' },
              contacts: [{ profile: { name: 'Rhea' }, wa_id: '919812345678' }],
              messages: [
                {
                  id: 'wamid.1',
                  from: '919812345678',
                  timestamp: '1780000000',
                  type: 'text',
                  text: { body: 'Where is my refund?' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it('requires a valid signature', () => {
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    expect(
      whatsappCloudProvider.verify(
        { rawBody, headers: { 'x-hub-signature-256': `sha256=${signature}` }, query: {} },
        { appSecret },
      ),
    ).toBe(true);
    expect(whatsappCloudProvider.verify({ rawBody, headers: {}, query: {} }, { appSecret })).toBe(false);
  });

  it('maps a text message with the sender phone number', () => {
    const [message] = whatsappCloudProvider.parse(body, context);
    expect(message).toMatchObject({
      externalId: 'wamid.1',
      from: { externalId: '919812345678', name: 'Rhea', phone: '+919812345678' },
      text: 'Where is my refund?',
    });
  });
});

describe('twilio voice', () => {
  const authToken = 'twilio-token';
  const url = 'https://desk.example.com/api/v1/webhooks/voice/chan-1';
  const params = { CallSid: 'CA1', From: '+15550001111', To: '+15550002222', CallStatus: 'completed' };

  it('verifies the Twilio signature over the url and parameters', () => {
    const signature = twilioSignature(authToken, url, params);
    expect(
      twilioVoiceProvider.verify(
        {
          rawBody: JSON.stringify(params),
          headers: { 'x-twilio-signature': signature, 'x-digisoft-webhook-url': url },
          query: {},
        },
        { authToken },
      ),
    ).toBe(true);
    expect(
      twilioVoiceProvider.verify(
        {
          rawBody: JSON.stringify(params),
          headers: { 'x-twilio-signature': 'wrong', 'x-digisoft-webhook-url': url },
          query: {},
        },
        { authToken },
      ),
    ).toBe(false);
  });

  it('describes the call, carrying the recording when there is one', () => {
    const [call] = twilioVoiceProvider.parse(
      { ...params, Direction: 'inbound', CallDuration: '95', RecordingUrl: 'https://rec/1' },
      context,
    );
    expect(call?.meta).toMatchObject({
      kind: 'call',
      direction: 'INBOUND',
      durationSeconds: 95,
      recordingUrl: 'https://rec/1',
    });
    expect(call?.text).toContain('Inbound call');
  });
});

describe('registry', () => {
  it('resolves an adapter for each supported pair and nothing else', () => {
    expect(providerFor('TELEGRAM', 'telegram')).not.toBeNull();
    expect(providerFor('WHATSAPP', 'whatsapp_cloud')).not.toBeNull();
    expect(providerFor('EMAIL', 'telegram')).toBeNull();
    expect(providerFor('EMAIL', 'made-up')).toBeNull();
  });

  it('knows which channels can send', () => {
    expect(supportsOutbound('TELEGRAM', 'telegram')).toBe(true);
    expect(supportsOutbound('WHATSAPP', 'whatsapp_cloud')).toBe(true);
    expect(supportsOutbound('VOICE', 'twilio')).toBe(false);
    expect(supportsOutbound('EMAIL', 'generic')).toBe(false);
  });
});
