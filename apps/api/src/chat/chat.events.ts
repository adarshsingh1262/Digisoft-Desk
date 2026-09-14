/** Shared constants for chat realtime, kept free of providers so any module can import them. */
export const CHAT_BRIDGE_CHANNEL = 'chat:emit';

export const CHAT_EVENTS = {
  STARTED: 'chat.started',
  MESSAGE: 'chat.message',
  ACCEPTED: 'chat.accepted',
  ENDED: 'chat.ended',
  TYPING: 'chat.typing',
} as const;

export const chatRoom = (sessionId: string): string => `chat:${sessionId}`;

export interface ChatEnvelope {
  organizationId: string;
  room: string;
  event: string;
  payload: unknown;
}
