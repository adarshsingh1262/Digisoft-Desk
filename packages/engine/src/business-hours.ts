/**
 * Business-hours arithmetic with no date library: working windows are expressed in the
 * calendar's own timezone and converted to absolute instants with Intl, so DST shifts
 * and holidays are respected without the caller thinking about either.
 */
export interface WorkingWindow {
  /** 0 = Sunday … 6 = Saturday, in the calendar's timezone. */
  day: number;
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface BusinessCalendar {
  timezone: string;
  weeklySchedule: WorkingWindow[];
  /** ISO dates (YYYY-MM-DD) that are not working days. */
  holidays: string[];
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: number; // 0-6
  hour: number;
  minute: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let cached = formatterCache.get(timezone);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatterCache.set(timezone, cached);
  }
  return cached;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function toLocalParts(instant: Date, timezone: string): LocalParts {
  const parts = formatter(timezone).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
  };
}

/**
 * Converts a wall-clock time in `timezone` to an instant. Two passes handle the offset
 * changing across a DST boundary.
 */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  // The wall-clock target, read as if it were UTC; each pass measures how far the
  // guess's local reading is from it and shifts by that amount.
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const local = toLocalParts(new Date(guess), timezone);
    const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    const diff = asUtc - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

function isoDate(parts: LocalParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function parseClock(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':').map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

interface Interval {
  start: Date;
  end: Date;
}

/** Working intervals on the local calendar day that contains `instant`. */
function windowsOnDay(dayInstant: Date, calendar: BusinessCalendar): Interval[] {
  const local = toLocalParts(dayInstant, calendar.timezone);
  if (calendar.holidays.includes(isoDate(local))) return [];

  return calendar.weeklySchedule
    .filter((window) => window.day === local.weekday)
    .map((window) => {
      const start = parseClock(window.start);
      const end = parseClock(window.end);
      return {
        start: zonedToUtc(local.year, local.month, local.day, start.hour, start.minute, calendar.timezone),
        end: zonedToUtc(local.year, local.month, local.day, end.hour, end.minute, calendar.timezone),
      };
    })
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Midnight (local) of the day after the local day containing `instant`. */
function nextLocalDay(instant: Date, timezone: string): Date {
  const local = toLocalParts(instant, timezone);
  const midnight = zonedToUtc(local.year, local.month, local.day, 0, 0, timezone);
  // Add ~1 day then re-anchor to local midnight so DST days of 23/25 hours still work.
  const roughly = new Date(midnight.getTime() + 26 * 60 * 60 * 1000);
  const next = toLocalParts(roughly, timezone);
  return zonedToUtc(next.year, next.month, next.day, 0, 0, timezone);
}

const MAX_DAYS_SCANNED = 400;

/** True when the calendar has at least one usable working window. */
export function hasWorkingTime(calendar: BusinessCalendar): boolean {
  return calendar.weeklySchedule.some((window) => {
    const start = parseClock(window.start);
    const end = parseClock(window.end);
    return end.hour * 60 + end.minute > start.hour * 60 + start.minute;
  });
}

/**
 * The instant `minutes` of working time after `from`. Outside working hours the clock
 * does not run, so a target set at 17:55 on Friday lands on Monday morning.
 */
export function addBusinessMinutes(from: Date, minutes: number, calendar: BusinessCalendar): Date {
  if (!hasWorkingTime(calendar)) {
    return new Date(from.getTime() + minutes * 60_000);
  }

  let remaining = minutes * 60_000;
  let cursor = from;

  for (let scanned = 0; scanned < MAX_DAYS_SCANNED; scanned += 1) {
    for (const window of windowsOnDay(cursor, calendar)) {
      if (window.end <= cursor) continue;
      const start = window.start > cursor ? window.start : cursor;
      const available = window.end.getTime() - start.getTime();
      if (remaining <= available) {
        return new Date(start.getTime() + remaining);
      }
      remaining -= available;
      cursor = window.end;
    }
    cursor = nextLocalDay(cursor, calendar.timezone);
  }

  throw new Error('Business calendar has no working time in the next year');
}

/** Working minutes between two instants (zero when `to` is not after `from`). */
export function businessMinutesBetween(from: Date, to: Date, calendar: BusinessCalendar): number {
  if (to <= from) return 0;
  if (!hasWorkingTime(calendar)) {
    return Math.round((to.getTime() - from.getTime()) / 60_000);
  }

  let total = 0;
  let cursor = from;

  for (let scanned = 0; scanned < MAX_DAYS_SCANNED && cursor < to; scanned += 1) {
    for (const window of windowsOnDay(cursor, calendar)) {
      const start = window.start > cursor ? window.start : cursor;
      const end = window.end < to ? window.end : to;
      if (end > start) {
        total += end.getTime() - start.getTime();
      }
    }
    cursor = nextLocalDay(cursor, calendar.timezone);
  }

  return Math.round(total / 60_000);
}

/** A calendar that never pauses: used when a target counts wall-clock time. */
export const ALWAYS_OPEN: BusinessCalendar = { timezone: 'UTC', weeklySchedule: [], holidays: [] };
