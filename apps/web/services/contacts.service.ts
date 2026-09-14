import type { CreateContactInput, UpdateContactInput } from '@digisoft/shared';
import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost } from '@/lib/api-client';
import type { ContactDetail, ContactSummary } from '@/types/api';

export interface ContactListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  accountId?: string;
  status?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export const contactsService = {
  list: (params: ContactListParams) => apiGetPaged<ContactSummary>('/contacts', { params }),
  get: (id: string) => apiGet<ContactDetail>(`/contacts/${id}`),
  create: (input: CreateContactInput) => apiPost<ContactSummary>('/contacts', input),
  update: (id: string, input: UpdateContactInput) =>
    apiPatch<ContactSummary>(`/contacts/${id}`, input),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/contacts/${id}`),
};
