import type { LoginInput, LoginResponse, LoginResult, RegisterInput } from '@digisoft/shared';
import { apiGet, apiPost } from '@/lib/api-client';
import type { AuthenticatedUser } from '@digisoft/shared';

export const authService = {
  /** May come back asking which organization to sign into — see `LoginResult`. */
  login: (input: LoginInput) => apiPost<LoginResult>('/auth/login', input),
  register: (input: RegisterInput) => apiPost<LoginResponse>('/auth/register', input),
  logout: () => apiPost<{ loggedOut: true }>('/auth/logout'),
  me: () => apiGet<AuthenticatedUser>('/auth/me'),
  forgotPassword: (input: { email: string; organizationSlug?: string }) =>
    apiPost<{ requested: true }>('/auth/forgot-password', input),
  resetPassword: (input: { token: string; password: string }) =>
    apiPost<{ reset: true }>('/auth/reset-password', input),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    apiPost<{ changed: true }>('/auth/change-password', input),
};
