import type {
  AnalyticsQuery,
  CsatSettingsInput,
  CsatSubmitInput,
  ReportDefinitionFormValues,
  ReportExportFormValues,
  UpdateReportDefinitionInput,
} from '@digisoft/shared';
import { apiGet, apiPatch, apiPost, apiDelete, http } from '@/lib/api-client';
import type {
  AgentReportDto,
  CsatReportDto,
  CsatSettingsDto,
  CsatSurveyDto,
  CsatSurveyResultDto,
  DashboardDto,
  ReportDefinitionDto,
  ReportExportDto,
  SlaReportDto,
  TicketCsatDto,
  TicketReportDto,
} from '@/types/api';

/** Query params, flattened — axios serialises a nested `filters` object as bracket
 * notation, which the API's flat query schema does not understand. */
function toParams(query: Partial<AnalyticsQuery>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params[key] = String(value);
  }
  return params;
}

export const analyticsService = {
  dashboard: (query: Partial<AnalyticsQuery>) =>
    apiGet<DashboardDto>('/dashboard', { params: toParams(query) }),
  tickets: (query: Partial<AnalyticsQuery>) =>
    apiGet<TicketReportDto>('/reports/tickets', { params: toParams(query) }),
  agents: (query: Partial<AnalyticsQuery>) =>
    apiGet<AgentReportDto>('/reports/agents', { params: toParams(query) }),
  sla: (query: Partial<AnalyticsQuery>) =>
    apiGet<SlaReportDto>('/reports/sla', { params: toParams(query) }),
  csat: (query: Partial<AnalyticsQuery>) =>
    apiGet<CsatReportDto>('/reports/csat', { params: toParams(query) }),

  listExports: () => apiGet<ReportExportDto[]>('/reports/exports'),
  createExport: (input: ReportExportFormValues) => apiPost<ReportExportDto>('/reports/export', input),
  getExport: (id: string) => apiGet<ReportExportDto>(`/reports/exports/${id}`),

  /**
   * The access token lives in memory, not a cookie, so a plain link would arrive
   * unauthenticated: the file is fetched with the session header and handed to the
   * browser as a blob, the same pattern as an attachment download.
   */
  async download(id: string, fileName: string): Promise<void> {
    const response = await http.get<Blob>(`/reports/exports/${id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  listDefinitions: () => apiGet<ReportDefinitionDto[]>('/report-definitions'),
  createDefinition: (input: ReportDefinitionFormValues) =>
    apiPost<ReportDefinitionDto>('/report-definitions', input),
  updateDefinition: (id: string, input: UpdateReportDefinitionInput) =>
    apiPatch<ReportDefinitionDto>(`/report-definitions/${id}`, input),
  removeDefinition: (id: string) => apiDelete<{ id: string }>(`/report-definitions/${id}`),

  csatSettings: () => apiGet<CsatSettingsDto>('/csat/settings'),
  updateCsatSettings: (input: CsatSettingsInput) =>
    apiPatch<CsatSettingsDto>('/csat/settings', input),
  ticketCsat: (ticketId: string) => apiGet<TicketCsatDto | null>(`/tickets/${ticketId}/csat`),
};

/** The customer's side of a survey. No auth token — the emailed token is the credential. */
export const csatSurveyService = {
  load: (token: string) => apiGet<CsatSurveyDto>(`/csat/${token}`),
  submit: (token: string, input: CsatSubmitInput) =>
    apiPost<CsatSurveyResultDto>(`/csat/${token}`, input),
};
