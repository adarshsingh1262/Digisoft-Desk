// Minimal, non-secret environment so modules that validate config at import time load.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://digisoft:digisoft@localhost:5432/digisoft_helpdesk_test?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-long-enough-000000';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-that-is-long-enough-0';
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'console';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.THROTTLE_ENABLED = process.env.THROTTLE_ENABLED || 'false';
