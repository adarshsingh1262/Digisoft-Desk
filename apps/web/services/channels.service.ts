import type {
  ChannelInput,
  ListChannelEventsQuery,
  ListChannelsQuery,
  UpdateChannelInput,
} from '@digisoft/shared';
import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost } from '@/lib/api-client';
import type { Channel, ChannelCatalogue, ChannelEvent } from '@/types/api';

export const channelsService = {
  catalogue: () => apiGet<ChannelCatalogue>('/channels/catalogue'),
  list: (params: Partial<ListChannelsQuery> = {}) => apiGet<Channel[]>('/channels', { params }),
  get: (id: string) => apiGet<Channel>(`/channels/${id}`),
  create: (input: ChannelInput) => apiPost<Channel>('/channels', input),
  update: (id: string, input: UpdateChannelInput) => apiPatch<Channel>(`/channels/${id}`, input),
  rotateWebhook: (id: string) => apiPost<{ webhookUrl: string }>(`/channels/${id}/rotate-webhook`),
  test: (id: string, input: { to: string; text?: string }) =>
    apiPost<{ sent: true; externalId: string | null }>(`/channels/${id}/test`, input),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/channels/${id}`),
  events: (params: Partial<ListChannelEventsQuery>) =>
    apiGetPaged<ChannelEvent>('/channels/events', { params }),
};
