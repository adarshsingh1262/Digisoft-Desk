import { addBusinessMinutes, businessMinutesBetween, zonedToUtc, type BusinessCalendar } from './business-hours';

const nineToSix = [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '18:00' }));

const kolkata: BusinessCalendar = { timezone: 'Asia/Kolkata', weeklySchedule: nineToSix, holidays: [] };
const newYork: BusinessCalendar = { timezone: 'America/New_York', weeklySchedule: nineToSix, holidays: [] };

describe('zonedToUtc', () => {
  it('converts a wall-clock time in a fixed-offset zone', () => {
    // 09:00 IST is 03:30 UTC.
    expect(zonedToUtc(2026, 3, 2, 9, 0, 'Asia/Kolkata').toISOString()).toBe('2026-03-02T03:30:00.000Z');
  });

  it('handles both sides of a DST change', () => {
    // 7 March 2026 is EST (UTC-5); 9 March 2026 is EDT (UTC-4).
    expect(zonedToUtc(2026, 3, 7, 9, 0, 'America/New_York').toISOString()).toBe('2026-03-07T14:00:00.000Z');
    expect(zonedToUtc(2026, 3, 9, 9, 0, 'America/New_York').toISOString()).toBe('2026-03-09T13:00:00.000Z');
  });
});

describe('addBusinessMinutes', () => {
  it('stays within the same working day when there is room', () => {
    // Monday 2 March 2026, 10:00 IST + 60 min = 11:00 IST.
    const from = zonedToUtc(2026, 3, 2, 10, 0, 'Asia/Kolkata');
    expect(addBusinessMinutes(from, 60, kolkata)).toEqual(zonedToUtc(2026, 3, 2, 11, 0, 'Asia/Kolkata'));
  });

  it('rolls over the end of the day into the next working morning', () => {
    // Monday 17:30 + 60 min: 30 min today, 30 min tomorrow from 09:00 -> 09:30 Tuesday.
    const from = zonedToUtc(2026, 3, 2, 17, 30, 'Asia/Kolkata');
    expect(addBusinessMinutes(from, 60, kolkata)).toEqual(zonedToUtc(2026, 3, 3, 9, 30, 'Asia/Kolkata'));
  });

  it('skips the weekend', () => {
    // Friday 6 March 2026 17:00 + 120 min -> Monday 9 March 10:00.
    const from = zonedToUtc(2026, 3, 6, 17, 0, 'Asia/Kolkata');
    expect(addBusinessMinutes(from, 120, kolkata)).toEqual(zonedToUtc(2026, 3, 9, 10, 0, 'Asia/Kolkata'));
  });

  it('skips holidays', () => {
    const withHoliday: BusinessCalendar = { ...kolkata, holidays: ['2026-03-03'] };
    // Monday 17:30 + 60 min, Tuesday is a holiday -> Wednesday 09:30.
    const from = zonedToUtc(2026, 3, 2, 17, 30, 'Asia/Kolkata');
    expect(addBusinessMinutes(from, 60, withHoliday)).toEqual(zonedToUtc(2026, 3, 4, 9, 30, 'Asia/Kolkata'));
  });

  it('starts the clock at the next opening when the start is outside hours', () => {
    // Saturday noon + 30 min -> Monday 09:30.
    const from = zonedToUtc(2026, 3, 7, 12, 0, 'Asia/Kolkata');
    expect(addBusinessMinutes(from, 30, kolkata)).toEqual(zonedToUtc(2026, 3, 9, 9, 30, 'Asia/Kolkata'));
  });

  it('spans multiple full days', () => {
    // Monday 09:00 + three nine-hour days lands exactly at Wednesday's close; one more
    // minute rolls into Thursday morning.
    const from = zonedToUtc(2026, 3, 2, 9, 0, 'Asia/Kolkata');
    expect(addBusinessMinutes(from, 27 * 60, kolkata)).toEqual(zonedToUtc(2026, 3, 4, 18, 0, 'Asia/Kolkata'));
    expect(addBusinessMinutes(from, 27 * 60 + 1, kolkata)).toEqual(zonedToUtc(2026, 3, 5, 9, 1, 'Asia/Kolkata'));
  });

  it('crosses a DST transition without gaining or losing an hour of work', () => {
    // Friday 6 March 2026 17:00 EST + 120 min -> Monday 9 March 10:00 EDT.
    const from = zonedToUtc(2026, 3, 6, 17, 0, 'America/New_York');
    expect(addBusinessMinutes(from, 120, newYork)).toEqual(zonedToUtc(2026, 3, 9, 10, 0, 'America/New_York'));
  });

  it('counts wall-clock time when the calendar has no working windows', () => {
    const from = new Date('2026-03-07T12:00:00Z');
    expect(addBusinessMinutes(from, 90, { timezone: 'UTC', weeklySchedule: [], holidays: [] })).toEqual(
      new Date('2026-03-07T13:30:00Z'),
    );
  });
});

describe('businessMinutesBetween', () => {
  it('measures within one day', () => {
    const a = zonedToUtc(2026, 3, 2, 10, 0, 'Asia/Kolkata');
    const b = zonedToUtc(2026, 3, 2, 12, 15, 'Asia/Kolkata');
    expect(businessMinutesBetween(a, b, kolkata)).toBe(135);
  });

  it('ignores nights and weekends', () => {
    // Friday 17:00 -> Monday 10:00 = 60 + 60.
    const a = zonedToUtc(2026, 3, 6, 17, 0, 'Asia/Kolkata');
    const b = zonedToUtc(2026, 3, 9, 10, 0, 'Asia/Kolkata');
    expect(businessMinutesBetween(a, b, kolkata)).toBe(120);
  });

  it('is the inverse of addBusinessMinutes', () => {
    const from = zonedToUtc(2026, 3, 4, 15, 45, 'Asia/Kolkata');
    const due = addBusinessMinutes(from, 500, kolkata);
    expect(businessMinutesBetween(from, due, kolkata)).toBe(500);
  });

  it('returns zero when the end is not after the start', () => {
    const a = new Date('2026-03-02T10:00:00Z');
    expect(businessMinutesBetween(a, a, kolkata)).toBe(0);
    expect(businessMinutesBetween(a, new Date(a.getTime() - 1000), kolkata)).toBe(0);
  });
});
