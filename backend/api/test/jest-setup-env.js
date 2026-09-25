// Minimal, non-secret environment so modules that validate config at import time load.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

/**
 * The suites truncate every table, so they must never reach a development database.
 * A shell that already exported the app's own DATABASE_URL (a loaded .env, direnv, a
 * docker-compose shell) would otherwise hand it straight to the harness — so the
 * database name is forced to end in `_test`, whatever was inherited.
 */
function testDatabaseUrl(inherited) {
  const fallback = 'postgresql://digisoft:digisoft@localhost:5432/digisoft_helpdesk_test?schema=public';
  if (!inherited) {
    return fallback;
  }
  try {
    const url = new URL(inherited);
    const name = url.pathname.replace(/^\//, '');
    if (!name) {
      return fallback;
    }
    if (!name.endsWith('_test')) {
      url.pathname = `/${name}_test`;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL);
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-long-enough-000000';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-that-is-long-enough-0';
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'console';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.THROTTLE_ENABLED = process.env.THROTTLE_ENABLED || 'false';
// Channel credentials are encrypted even in tests; this key exists only here.
process.env.CHANNEL_ENCRYPTION_KEY =
  process.env.CHANNEL_ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
