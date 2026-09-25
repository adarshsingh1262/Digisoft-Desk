import type { CreateActivityInput, ListActivitiesQuery, UpdateActivityInput } from '@digisoft/shared';
import { apiDelete, apiGetPaged, apiPatch, apiPost } from '@/lib/api-client';
import type { Activity } from '@/types/api';

export const activitiesService = {
  list: (params: Partial<ListActivitiesQuery>) => apiGetPaged<Activity>('/activities', { params }),
  create: (input: CreateActivityInput) => apiPost<Activity>('/activities', input),
  update: (id: string, input: UpdateActivityInput) => apiPatch<Activity>(`/activities/${id}`, input),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/activities/${id}`),
};
