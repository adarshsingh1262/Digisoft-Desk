import type {
  CreateDepartmentInput,
  CreateRoleInput,
  CreateTeamInput,
  CreateUserInput,
  UpdateDepartmentInput,
  UpdateOrganizationInput,
  UpdateRoleInput,
  UpdateTeamInput,
  UpdateUserInput,
} from '@digisoft/shared';
import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost } from '@/lib/api-client';
import type {
  BusinessHours,
  Department,
  OrganizationSummary,
  Permission,
  Role,
  Team,
  UserSummary,
} from '@/types/api';

export const organizationService = {
  current: () => apiGet<OrganizationSummary>('/organizations/current'),
  update: (input: UpdateOrganizationInput) =>
    apiPatch<OrganizationSummary>('/organizations/current', input),
  businessHours: () => apiGet<BusinessHours[]>('/organizations/current/business-hours'),
};

export const usersService = {
  list: (params: { page?: number; pageSize?: number; q?: string; isActive?: boolean }) =>
    apiGetPaged<UserSummary>('/users', { params }),
  get: (id: string) => apiGet<UserSummary>(`/users/${id}`),
  create: (input: CreateUserInput) => apiPost<UserSummary>('/users', input),
  update: (id: string, input: UpdateUserInput) => apiPatch<UserSummary>(`/users/${id}`, input),
  setRoles: (id: string, roleIds: string[]) =>
    apiPatch<UserSummary>(`/users/${id}/roles`, { roleIds }),
  setDepartments: (id: string, departmentIds: string[]) =>
    apiPatch<UserSummary>(`/users/${id}/departments`, { departmentIds }),
  activate: (id: string) => apiPost<UserSummary>(`/users/${id}/activate`),
  deactivate: (id: string) => apiPost<UserSummary>(`/users/${id}/deactivate`),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/users/${id}`),
  resendInvite: (id: string) => apiPost<{ invited: true }>(`/users/${id}/invite`),
};

export const rolesService = {
  list: () => apiGet<Role[]>('/roles'),
  permissions: () => apiGet<Permission[]>('/permissions'),
  create: (input: CreateRoleInput) => apiPost<Role>('/roles', input),
  update: (id: string, input: UpdateRoleInput) => apiPatch<Role>(`/roles/${id}`, input),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/roles/${id}`),
};

export const departmentsService = {
  list: () => apiGet<Department[]>('/departments'),
  create: (input: CreateDepartmentInput) => apiPost<Department>('/departments', input),
  update: (id: string, input: UpdateDepartmentInput) =>
    apiPatch<Department>(`/departments/${id}`, input),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/departments/${id}`),
};

export const teamsService = {
  list: () => apiGet<Team[]>('/teams'),
  create: (input: CreateTeamInput) => apiPost<Team>('/teams', input),
  update: (id: string, input: UpdateTeamInput) => apiPatch<Team>(`/teams/${id}`, input),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/teams/${id}`),
};
