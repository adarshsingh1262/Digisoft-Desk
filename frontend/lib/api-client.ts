'use client';

import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiFailure, ApiResponse, PageMeta } from '@digisoft/shared';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * The access token lives in memory only — never localStorage — so an XSS payload
 * cannot read it back out of storage. The refresh token is an http-only cookie the
 * browser attaches to /auth routes on its own.
 */
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onSessionExpired(handler: () => void): void {
  onSessionLost = handler;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

async function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= axios
    .post<ApiResponse<{ accessToken: string }>>(
      `${BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    )
    .then((response) => {
      const body = response.data;
      const token = body.success ? body.data.accessToken : null;
      setAccessToken(token);
      return token;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiFailure>) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status ?? 0;
    const code = error.response?.data?.error?.code;

    // One transparent refresh attempt, and never on the auth routes themselves.
    if (
      status === 401 &&
      original &&
      !original._retried &&
      !original.url?.startsWith('/auth/refresh') &&
      !original.url?.startsWith('/auth/login')
    ) {
      original._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        return http.request(original);
      }
      onSessionLost?.();
    }

    throw new ApiError(
      code ?? 'INTERNAL_ERROR',
      error.response?.data?.error?.message ?? error.message ?? 'Something went wrong',
      status,
      error.response?.data?.error?.details,
    );
  },
);

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.get<ApiResponse<T>>(url, config);
  return unwrap(response.data);
}

export interface PagedResult<T> {
  items: T[];
  meta: PageMeta;
}

export async function apiGetPaged<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<PagedResult<T>> {
  const response = await http.get<ApiResponse<T[]>>(url, config);
  const body = response.data;
  if (!body.success) {
    throw new ApiError(body.error.code, body.error.message, 400, body.error.details);
  }
  return {
    items: body.data,
    meta: body.meta ?? { page: 1, pageSize: body.data.length, total: body.data.length, totalPages: 1 },
  };
}

export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  const response = await http.post<ApiResponse<T>>(url, data);
  return unwrap(response.data);
}

export async function apiPatch<T>(url: string, data?: unknown): Promise<T> {
  const response = await http.patch<ApiResponse<T>>(url, data);
  return unwrap(response.data);
}

export async function apiDelete<T>(url: string): Promise<T> {
  const response = await http.delete<ApiResponse<T>>(url);
  return unwrap(response.data);
}

function unwrap<T>(body: ApiResponse<T>): T {
  if (!body.success) {
    throw new ApiError(body.error.code, body.error.message, 400, body.error.details);
  }
  return body.data;
}

export { refreshAccessToken };
