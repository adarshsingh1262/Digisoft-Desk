import { apiGetPaged, apiGet, apiPost } from '@/lib/api-client';
import type { Notification } from '@/types/api';

export const notificationsService = {
  list: (params: { page?: number; pageSize?: number; unreadOnly?: boolean }) =>
    apiGetPaged<Notification>('/notifications', { params }),
  unreadCount: () => apiGet<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiPost<{ read: true }>(`/notifications/${id}/read`),
  markAllRead: () => apiPost<{ read: number }>('/notifications/read-all'),
};
