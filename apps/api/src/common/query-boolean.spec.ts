import { listTicketsQuerySchema, queryBoolean } from '@digisoft/shared';

describe('queryBoolean', () => {
  it.each([['true', true], ['1', true], ['false', false], ['0', false]])('parses %s', (raw, expected) => {
    expect(queryBoolean.parse(raw)).toBe(expected);
  });

  it('rejects anything that is not a boolean spelling', () => {
    expect(queryBoolean.safeParse('yes').success).toBe(false);
    expect(queryBoolean.safeParse('').success).toBe(false);
  });

  it('keeps ?flag=false meaning false in a list query', () => {
    expect(listTicketsQuerySchema.parse({ open: 'false' }).open).toBe(false);
    expect(listTicketsQuerySchema.parse({ open: 'true' }).open).toBe(true);
  });
});
