import type { ChannelType } from '@digisoft/shared';
import type { ChannelProvider } from './types';
import { genericEmailProvider, mailgunEmailProvider, postmarkEmailProvider } from './providers/email';
import { telegramProvider } from './providers/telegram';
import { instagramProvider, messengerProvider } from './providers/meta';
import { whatsappCloudProvider } from './providers/whatsapp';
import { twilioVoiceProvider } from './providers/voice';
import { nativeChatProvider } from './providers/chat';

const PROVIDERS: ChannelProvider[] = [
  genericEmailProvider,
  mailgunEmailProvider,
  postmarkEmailProvider,
  nativeChatProvider,
  telegramProvider,
  messengerProvider,
  instagramProvider,
  whatsappCloudProvider,
  twilioVoiceProvider,
];

/** The adapter for a channel, or null when the pair is not one this product supports. */
export function providerFor(type: ChannelType, key: string): ChannelProvider | null {
  return PROVIDERS.find((provider) => provider.type === type && provider.key === key) ?? null;
}

export function supportsOutbound(type: ChannelType, key: string): boolean {
  return providerFor(type, key)?.send !== undefined;
}
