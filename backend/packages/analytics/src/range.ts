import type { AnalyticsQuery } from '@digisoft/shared';
import type { DateRange } from './types';

export const DAY_MS = 86_400_000;

export function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

/**
 * Turns a named range into concrete UTC bounds. Presets are resolved on the server so
 * two clients in different timezones cannot disagree about "last 7 days", and the range
 * is half-open so consecutive ranges never double-count a ticket.
 */
export function resolveRange(
  query: Pick<AnalyticsQuery, 'range' | 'from' | 'to'>,
  now: Date = new Date(),
): DateRange {
  const today = startOfUtcDay(now);
  const tomorrow = addDays(today, 1);

  switch (query.range) {
    case 'today':
      return { from: today, to: tomorrow };
    case '7d':
      return { from: addDays(today, -6), to: tomorrow };
    case '90d':
      return { from: addDays(today, -89), to: tomorrow };
    case 'custom': {
      if (!query.from || !query.to) {
        throw new Error('A custom range needs both from and to');
      }
      const from = startOfUtcDay(new Date(query.from));
      // `to` is inclusive for the caller and exclusive here, so a single-day custom
      // range covers that whole day.
      const to = addDays(startOfUtcDay(new Date(query.to)), 1);
      return { from, to };
    }
    case '30d':
    default:
      return { from: addDays(today, -29), to: tomorrow };
  }
}

/** Every UTC midnight in the range, oldest first. */
export function eachDay(range: DateRange): Date[] {
  const days: Date[] = [];
  for (let day = startOfUtcDay(range.from); day < range.to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

export function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Average with an explicit "no samples" answer rather than a misleading zero. */
export function average(total: number, samples: number): number | null {
  return samples > 0 ? Math.round((total / samples) * 10) / 10 : null;
}

/** A percentage, or null when nothing was measured. */
export function percentage(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}
