import type { CreateAccountInput, UpdateAccountInput } from '@digisoft/shared';
import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost } from '@/lib/api-client';
import type { AccountDetail, AccountSummary, ContactSummary } from '@/types/api';

export interface AccountListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export const accountsService = {
  list: (params: AccountListParams) => apiGetPaged<AccountSummary>('/accounts', { params }),
  get: (id: string) => apiGet<AccountDetail>(`/accounts/${id}`),
  contacts: (id: string) => apiGet<ContactSummary[]>(`/accounts/${id}/contacts`),
  create: (input: CreateAccountInput) => apiPost<AccountSummary>('/accounts', input),
  update: (id: string, input: UpdateAccountInput) =>
    apiPatch<AccountSummary>(`/accounts/${id}`, input),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/accounts/${id}`),
};
