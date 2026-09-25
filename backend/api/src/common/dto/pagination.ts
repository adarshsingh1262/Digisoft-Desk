import type { PageMeta } from '@digisoft/shared';

export interface PageRequest {
  page: number;
  pageSize: number;
}

export function toSkipTake(query: PageRequest): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function pageMeta(query: PageRequest, total: number): PageMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Whitelists sort fields so a client-supplied string can never reach Prisma's
 * orderBy as an arbitrary column name.
 */
export function orderBy<TField extends string>(
  requested: string | undefined,
  allowed: readonly TField[],
  direction: 'asc' | 'desc',
  fallback: TField,
): Record<string, 'asc' | 'desc'> {
  const field = allowed.includes(requested as TField) ? (requested as TField) : fallback;
  return { [field]: direction };
}
