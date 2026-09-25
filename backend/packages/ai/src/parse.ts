import { AiError } from './types';

/**
 * Pulls the JSON object out of a model response. Models occasionally wrap JSON in a
 * code fence or add a sentence around it; a tolerant reader costs less than a retry,
 * and anything genuinely unparseable is an error rather than a guess.
 */
export function parseJsonObject(raw: string): Record<string, unknown> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidates = [fenced?.[1], raw, sliceBraces(raw)].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate.trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next candidate
    }
  }
  throw new AiError('The assistant did not return usable JSON');
}

function sliceBraces(raw: string): string | undefined {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start >= 0 && end > start ? raw.slice(start, end + 1) : undefined;
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function asStringArray(value: unknown, limit = 10): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, limit)
    : [];
}

export function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = typeof value === 'string' ? (value.toUpperCase() as T) : fallback;
  return allowed.includes(candidate) ? candidate : fallback;
}
