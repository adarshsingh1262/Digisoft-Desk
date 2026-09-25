import type {
  AssignTicketInput,
  ChangePriorityInput,
  ChangeStatusInput,
  CreateMessageInput,
  CreateTicketInput,
  LinkTicketInput,
  ListTicketsQuery,
  MergeTicketInput,
  ResolveTicketInput,
  TagInput,
  TicketCategoryInput,
  TicketPriorityInput,
  TicketStatusInput,
  UpdateTicketInput,
} from '@digisoft/shared';
import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost, http } from '@/lib/api-client';
import type {
  TagWithCount,
  TicketAttachment,
  TicketCategory,
  TicketDetail,
  TicketHistoryEntry,
  TicketMessage,
  TicketPriorityConfig,
  TicketQueueSummary,
  TicketStatusConfig,
  TicketSummary,
  TicketTransitions,
} from '@/types/api';

export const ticketsService = {
  list: (params: Partial<ListTicketsQuery>) => apiGetPaged<TicketSummary>('/tickets', { params }),
  summary: () => apiGet<TicketQueueSummary>('/tickets/summary'),
  get: (id: string) => apiGet<TicketDetail>(`/tickets/${id}`),
  create: (input: CreateTicketInput) => apiPost<TicketDetail>('/tickets', input),
  update: (id: string, input: UpdateTicketInput) => apiPatch<TicketDetail>(`/tickets/${id}`, input),
  assign: (id: string, input: AssignTicketInput) =>
    apiPost<TicketDetail>(`/tickets/${id}/assign`, input),
  changeStatus: (id: string, input: ChangeStatusInput) =>
    apiPost<TicketDetail>(`/tickets/${id}/status`, input),
  changePriority: (id: string, input: ChangePriorityInput) =>
    apiPost<TicketDetail>(`/tickets/${id}/priority`, input),
  resolve: (id: string, input: ResolveTicketInput) =>
    apiPost<TicketDetail>(`/tickets/${id}/resolve`, input),
  close: (id: string) => apiPost<TicketDetail>(`/tickets/${id}/close`),
  reopen: (id: string) => apiPost<TicketDetail>(`/tickets/${id}/reopen`),
  setTags: (id: string, tagIds: string[]) =>
    apiPatch<TicketDetail>(`/tickets/${id}/tags`, { tagIds }),
  merge: (id: string, input: MergeTicketInput) => apiPost<TicketDetail>(`/tickets/${id}/merge`, input),
  link: (id: string, input: LinkTicketInput) => apiPost<TicketDetail>(`/tickets/${id}/links`, input),
  unlink: (id: string, linkId: string) => apiDelete<TicketDetail>(`/tickets/${id}/links/${linkId}`),
  follow: (id: string) => apiPost<{ following: boolean }>(`/tickets/${id}/follow`),
  unfollow: (id: string) => apiPost<{ following: boolean }>(`/tickets/${id}/unfollow`),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/tickets/${id}`),

  messages: (id: string) => apiGetPaged<TicketMessage>(`/tickets/${id}/messages`),
  reply: (id: string, input: CreateMessageInput) =>
    apiPost<TicketMessage>(`/tickets/${id}/messages`, input),
  comment: (id: string, input: CreateMessageInput) =>
    apiPost<TicketMessage>(`/tickets/${id}/comments`, input),
  history: (id: string) => apiGetPaged<TicketHistoryEntry>(`/tickets/${id}/history`),
  transitions: (id: string) => apiGet<TicketTransitions>(`/tickets/${id}/transitions`),

  attachments: (id: string) => apiGet<TicketAttachment[]>(`/tickets/${id}/attachments`),
  upload: async (id: string, file: File): Promise<TicketAttachment> => {
    const form = new FormData();
    form.append('file', file);
    const response = await http.post<{ success: true; data: TicketAttachment }>(
      `/tickets/${id}/attachments`,
      form,
      // Let the browser set the multipart boundary itself.
      { headers: { 'Content-Type': undefined as unknown as string } },
    );
    return response.data.data;
  },
  removeAttachment: (attachmentId: string) =>
    apiDelete<{ deleted: true }>(`/attachments/${attachmentId}`),
};

export const ticketConfigService = {
  statuses: () => apiGet<TicketStatusConfig[]>('/ticket-statuses'),
  createStatus: (input: TicketStatusInput) => apiPost<TicketStatusConfig>('/ticket-statuses', input),
  updateStatus: (id: string, input: Partial<TicketStatusInput>) =>
    apiPatch<TicketStatusConfig>(`/ticket-statuses/${id}`, input),
  removeStatus: (id: string) => apiDelete<{ deleted: true }>(`/ticket-statuses/${id}`),

  priorities: () => apiGet<TicketPriorityConfig[]>('/ticket-priorities'),
  createPriority: (input: TicketPriorityInput) =>
    apiPost<TicketPriorityConfig>('/ticket-priorities', input),
  removePriority: (id: string) => apiDelete<{ deleted: true }>(`/ticket-priorities/${id}`),

  categories: () => apiGet<TicketCategory[]>('/ticket-categories'),
  createCategory: (input: TicketCategoryInput) =>
    apiPost<TicketCategory>('/ticket-categories', input),
  removeCategory: (id: string) => apiDelete<{ deleted: true }>(`/ticket-categories/${id}`),

  tags: () => apiGet<TagWithCount[]>('/tags'),
  createTag: (input: TagInput) => apiPost<TagWithCount>('/tags', input),
  removeTag: (id: string) => apiDelete<{ deleted: true }>(`/tags/${id}`),
};

/**
 * Downloads an attachment. The access token lives in memory rather than a cookie, so a
 * plain link would arrive unauthenticated: the file is fetched with the session header
 * and handed to the browser as a blob.
 */
export async function downloadAttachment(attachmentId: string, fileName: string): Promise<void> {
  const response = await http.get<Blob>(`/attachments/${attachmentId}/download`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
