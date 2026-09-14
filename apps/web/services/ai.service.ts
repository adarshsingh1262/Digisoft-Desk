import type { AiSettingsInput, GenerateInsightInput } from '@digisoft/shared';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type { AiArticleSuggestion, AiInsightDto, AiSettingsDto, AiUsageDto } from '@/types/api';

export const aiService = {
  settings: () => apiGet<AiSettingsDto>('/ai/settings'),
  updateSettings: (input: AiSettingsInput) => apiPatch<AiSettingsDto>('/ai/settings', input),
  usage: () => apiGet<AiUsageDto>('/ai/usage'),
  test: () =>
    apiPost<{ ok: true; provider: string; model: string; usage: { inputTokens: number; outputTokens: number } }>(
      '/ai/test',
    ),

  forTicket: (ticketId: string) => apiGet<AiInsightDto[]>(`/tickets/${ticketId}/ai`),
  articles: (ticketId: string) => apiGet<AiArticleSuggestion[]>(`/tickets/${ticketId}/ai/articles`),
  generate: (ticketId: string, input: GenerateInsightInput) =>
    apiPost<AiInsightDto>(`/tickets/${ticketId}/ai`, input),
};
