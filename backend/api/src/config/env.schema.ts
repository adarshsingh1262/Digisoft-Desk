import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('api/v1'),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  BACKEND_URL: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(30),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: bool.default(false),

  /** Disabled only by the e2e harness so suites can replay the same route. */
  THROTTLE_ENABLED: bool.default(true),
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  /** A single workspace navigation fans out to several endpoints, so this is per
   * user-minute rather than per page view. */
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(300),
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),

  EMAIL_PROVIDER: z.enum(['smtp', 'ses', 'console']).default('console'),
  EMAIL_FROM: z.string().default('Digisoft360 Help Desk <no-reply@digisoft360.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: bool.default(false),
  AWS_REGION: z.string().optional(),

  /** `local` writes to disk and streams downloads through the API; `s3` presigns. */
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),
  S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(604800).default(300),
  /** Hard ceiling on a single upload, in bytes. */
  ATTACHMENT_MAX_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(true),

  /**
   * 32 bytes, base64 or hex, used to encrypt channel credentials at rest. Required
   * before a channel can store credentials; generate with `openssl rand -base64 32`.
   */
  CHANNEL_ENCRYPTION_KEY: z.string().optional(),
  /** Public base URL providers post webhooks to; defaults to BACKEND_URL. */
  PUBLIC_API_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  /** Retry budget for one outbound webhook delivery before it is marked failed. */
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
