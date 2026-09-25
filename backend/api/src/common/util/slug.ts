import { slugify } from '@digisoft/shared';

/**
 * Turns a title into a slug that is free within its scope. The caller supplies the
 * lookup because each model scopes uniqueness differently (per organization for
 * articles and topics, platform-wide for help centers).
 */
export async function uniqueSlug(
  source: string,
  isTaken: (candidate: string) => Promise<boolean>,
  fallback = 'item',
): Promise<string> {
  const base = slugify(source) || fallback;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }
  return `${base}-${Date.now().toString(36)}`;
}
