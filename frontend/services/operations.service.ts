import type {
  AssignmentRuleInput,
  AutomationRuleInput,
  BlueprintInput,
  ListAutomationRunsQuery,
  SlaPolicyInput,
  UpdateAssignmentRuleInput,
} from '@digisoft/shared';
import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost } from '@/lib/api-client';
import type { AssignmentRule, AutomationRule, AutomationRun, Blueprint, SlaPolicy } from '@/types/api';

export const assignmentRulesService = {
  list: () => apiGet<AssignmentRule[]>('/assignment-rules'),
  create: (input: AssignmentRuleInput) => apiPost<AssignmentRule>('/assignment-rules', input),
  update: (id: string, input: UpdateAssignmentRuleInput) => apiPatch<AssignmentRule>(`/assignment-rules/${id}`, input),
  reorder: (ids: string[]) => apiPatch<AssignmentRule[]>('/assignment-rules/reorder', { ids }),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/assignment-rules/${id}`),
};

export const automationRulesService = {
  list: (escalations?: boolean) =>
    apiGet<AutomationRule[]>('/automation-rules', { params: escalations === undefined ? {} : { escalations } }),
  create: (input: AutomationRuleInput) => apiPost<AutomationRule>('/automation-rules', input),
  update: (id: string, input: Partial<AutomationRuleInput>) => apiPatch<AutomationRule>(`/automation-rules/${id}`, input),
  enable: (id: string) => apiPost<AutomationRule>(`/automation-rules/${id}/enable`),
  disable: (id: string) => apiPost<AutomationRule>(`/automation-rules/${id}/disable`),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/automation-rules/${id}`),
  runs: (params: Partial<ListAutomationRunsQuery>) => apiGetPaged<AutomationRun>('/automation-rules/runs', { params }),
};

export const slaPoliciesService = {
  list: () => apiGet<SlaPolicy[]>('/sla-policies'),
  create: (input: SlaPolicyInput) => apiPost<SlaPolicy>('/sla-policies', input),
  update: (id: string, input: SlaPolicyInput) => apiPatch<SlaPolicy>(`/sla-policies/${id}`, input),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/sla-policies/${id}`),
};

export const blueprintsService = {
  list: () => apiGet<Blueprint[]>('/blueprints'),
  create: (input: BlueprintInput) => apiPost<Blueprint>('/blueprints', input),
  update: (id: string, input: BlueprintInput) => apiPatch<Blueprint>(`/blueprints/${id}`, input),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/blueprints/${id}`),
};
