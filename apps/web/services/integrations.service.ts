import type {
  ApiKeyInput,
  ListWebhookDeliveriesQuery,
  UpdateWebhookEndpointInput,
  WebhookEndpointInput,
} from '@digisoft/shared';
import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost } from '@/lib/api-client';
import type { ApiKeyDto, WebhookDeliveryDto, WebhookEndpointDto } from '@/types/api';

export const webhooksService = {
  list: () => apiGet<WebhookEndpointDto[]>('/webhook-endpoints'),
  create: (input: WebhookEndpointInput) =>
    apiPost<WebhookEndpointDto>('/webhook-endpoints', input),
  update: (id: string, input: UpdateWebhookEndpointInput) =>
    apiPatch<WebhookEndpointDto>(`/webhook-endpoints/${id}`, input),
  rotateSecret: (id: string) =>
    apiPost<{ secret: string }>(`/webhook-endpoints/${id}/rotate-secret`),
  test: (id: string) => apiPost<{ queued: true }>(`/webhook-endpoints/${id}/test`),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/webhook-endpoints/${id}`),
  deliveries: (params: Partial<ListWebhookDeliveriesQuery>) =>
    apiGetPaged<WebhookDeliveryDto>('/webhook-deliveries', { params }),
  replay: (id: string) => apiPost<{ queued: true }>(`/webhook-deliveries/${id}/replay`),
};

export const apiKeysService = {
  list: () => apiGet<ApiKeyDto[]>('/api-keys'),
  create: (input: ApiKeyInput) => apiPost<ApiKeyDto>('/api-keys', input),
  revoke: (id: string) => apiDelete<{ revoked: true }>(`/api-keys/${id}`),
};
