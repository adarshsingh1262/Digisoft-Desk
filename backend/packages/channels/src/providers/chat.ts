import type { ChannelProvider, InboundMessage, ParseContext } from '../types';

/**
 * Live chat has no third party: visitors talk to this product directly over its own
 * authenticated endpoints, so the adapter exists only so chat is configured, listed
 * and routed like every other channel. It accepts no webhook.
 */
export const nativeChatProvider: ChannelProvider = {
  key: 'native',
  type: 'CHAT',
  verify(): boolean {
    return false;
  },
  parse(_payload: unknown, _context: ParseContext): InboundMessage[] {
    return [];
  },
};
