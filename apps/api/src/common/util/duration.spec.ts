import { durationToSeconds } from './duration';

describe('durationToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['7d', 604800],
  ])('converts %s', (input, expected) => {
    expect(durationToSeconds(input as string)).toBe(expected);
  });

  it.each(['', '15', 'm15', '15w', '-5m', '15 m'])('rejects %s', (input) => {
    expect(() => durationToSeconds(input)).toThrow();
  });
});
