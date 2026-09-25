import type { HelpCenterSettingsInput, UpdateWebFormInput, WebFormInput } from '@digisoft/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type { HelpCenter, WebForm } from '@/types/api';

export const helpCenterService = {
  get: () => apiGet<HelpCenter>('/help-center'),
  update: (input: HelpCenterSettingsInput) => apiPatch<HelpCenter>('/help-center', input),

  forms: () => apiGet<WebForm[]>('/web-forms'),
  form: (id: string) => apiGet<WebForm>(`/web-forms/${id}`),
  createForm: (input: WebFormInput) => apiPost<WebForm>('/web-forms', input),
  updateForm: (id: string, input: UpdateWebFormInput) => apiPatch<WebForm>(`/web-forms/${id}`, input),
  removeForm: (id: string) => apiDelete<{ deleted: true }>(`/web-forms/${id}`),
};
