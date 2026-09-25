import { z } from 'zod';
import { paginationQuerySchema } from './pagination';
import { optionalField } from './field';

export const CHAT_SESSION_STATUSES = ['QUEUED', 'ACTIVE', 'ENDED'] as const;
export type ChatSessionStatus = (typeof CHAT_SESSION_STATUSES)[number];

/** What the widget sends to open a conversation. */
export const startChatSchema = z.object({
  name: optionalField(z.string().trim().max(80)),
  email: optionalField(z.string().email().toLowerCase().trim()),
  message: z.string().trim().min(1).max(5000),
  pageUrl: optionalField(z.string().trim().max(500)),
});
export type StartChatInput = z.infer<typeof startChatSchema>;
export type StartChatFormValues = z.input<typeof startChatSchema>;

export const chatMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

export const rateChatSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
});
export type RateChatInput = z.infer<typeof rateChatSchema>;

export const listChatSessionsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CHAT_SESSION_STATUSES).optional(),
});
export type ListChatSessionsQuery = z.infer<typeof listChatSessionsQuerySchema>;
