/**
 * The e2e harness truncates every table, so its environment must never be able to point
 * at a development database — not even when the shell running the tests already
 * exported the application's own DATABASE_URL.
 */
describe('e2e database url', () => {
  const load = (inherited?: string): string => {
    jest.resetModules();
    const previous = process.env.DATABASE_URL;
    if (inherited === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = inherited;
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../test/jest-setup-env');
    const result = process.env.DATABASE_URL as string;
    process.env.DATABASE_URL = previous;
    return result;
  };

  it('appends _test to an inherited development database', () => {
    expect(load('postgresql://digisoft@localhost:5432/digisoft_helpdesk?schema=public')).toContain(
      '/digisoft_helpdesk_test',
    );
  });

  it('leaves a database that is already a test database alone', () => {
    expect(load('postgresql://digisoft@localhost:5432/other_test')).toBe(
      'postgresql://digisoft@localhost:5432/other_test',
    );
  });

  it('falls back when nothing usable is inherited', () => {
    expect(load(undefined)).toContain('digisoft_helpdesk_test');
    expect(load('not-a-url')).toContain('digisoft_helpdesk_test');
  });
});
