import { addDays, average, dayKey, eachDay, percentage, resolveRange, startOfUtcDay } from './range';
import { toCsv } from './csv';
import { createSurveyToken, hashSurveyToken } from './csat';

const NOW = new Date('2026-09-15T13:45:00.000Z');

describe('resolveRange', () => {
  it('covers today from midnight to midnight', () => {
    const range = resolveRange({ range: 'today' }, NOW);
    expect(range.from.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-09-16T00:00:00.000Z');
  });

  it('counts today as one of the last seven days', () => {
    const range = resolveRange({ range: '7d' }, NOW);
    expect(range.from.toISOString()).toBe('2026-09-09T00:00:00.000Z');
    expect(eachDay(range)).toHaveLength(7);
  });

  it('includes the whole of a custom end day', () => {
    const range = resolveRange(
      { range: 'custom', from: '2026-09-01T09:30:00.000Z', to: '2026-09-03T02:00:00.000Z' },
      NOW,
    );
    expect(range.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-09-04T00:00:00.000Z');
    expect(eachDay(range)).toHaveLength(3);
  });

  it('refuses a custom range without both ends', () => {
    expect(() => resolveRange({ range: 'custom', from: '2026-09-01' }, NOW)).toThrow(/both/);
  });

  it('is half-open, so consecutive ranges cannot double-count a day', () => {
    const first = resolveRange({ range: 'custom', from: '2026-09-01', to: '2026-09-02' }, NOW);
    const second = resolveRange({ range: 'custom', from: '2026-09-03', to: '2026-09-04' }, NOW);
    expect(first.to.getTime()).toBe(second.from.getTime());
    expect(eachDay(first).concat(eachDay(second))).toHaveLength(4);
  });

  it('falls back to 30 days', () => {
    expect(eachDay(resolveRange({ range: '30d' }, NOW))).toHaveLength(30);
    expect(eachDay(resolveRange({ range: '90d' }, NOW))).toHaveLength(90);
  });
});

describe('day helpers', () => {
  it('truncates to UTC midnight regardless of the time of day', () => {
    expect(startOfUtcDay(new Date('2026-09-15T23:59:59.999Z')).toISOString()).toBe(
      '2026-09-15T00:00:00.000Z',
    );
  });

  it('crosses a month boundary', () => {
    expect(dayKey(addDays(new Date('2026-08-31T00:00:00.000Z'), 1))).toBe('2026-09-01');
  });
});

describe('average and percentage', () => {
  it('answers null rather than zero when nothing was measured', () => {
    expect(average(0, 0)).toBeNull();
    expect(percentage(0, 0)).toBeNull();
  });

  it('rounds to one decimal', () => {
    expect(average(100, 3)).toBe(33.3);
    expect(percentage(1, 3)).toBe(33.3);
  });

  it('reports a full rate as 100', () => {
    expect(percentage(7, 7)).toBe(100);
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    const csv = toCsv(
      ['Rating', 'Comment'],
      [[5, 'Fast, friendly'], [1, 'They said "no"'], [3, 'line one\nline two']],
    );
    expect(csv.split('\r\n')[1]).toBe('5,"Fast, friendly"');
    expect(csv.split('\r\n')[2]).toBe('1,"They said ""no"""');
    expect(csv).toContain('"line one\nline two"');
  });

  it('writes an empty cell for null and undefined', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\r\n,');
  });
});

describe('survey tokens', () => {
  it('never repeats a token', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createSurveyToken().token));
    expect(tokens.size).toBe(200);
  });

  it('stores a hash the token cannot be read back from', () => {
    const { token, tokenHash } = createSurveyToken();
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).not.toContain(token);
    expect(hashSurveyToken(token)).toBe(tokenHash);
  });

  it('is URL-safe, so the link survives an email client', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(createSurveyToken().token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});
