import { z } from 'zod';

/** URL segment: lowercase, digits and single hyphens. */
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Use lowercase letters, digits and hyphens');

/**
 * Derives a URL segment from a title. Shared so the agent UI can preview exactly the
 * address the backend will store, and so two callers never disagree about it.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}
