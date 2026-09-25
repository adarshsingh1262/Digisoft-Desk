import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  /** How often the SLA sweep runs. Warnings and breaches are detected to this resolution. */
  SLA_SCAN_INTERVAL_SECONDS: z.coerce.number().int().min(15).default(60),

  EMAIL_PROVIDER: z.enum(['smtp', 'ses', 'console']).default('console'),
  EMAIL_FROM: z.string().default('Digisoft360 Help Desk <no-reply@digisoft360.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: bool.default(false),
  AWS_REGION: z.string().optional(),

  /** Same key the API uses; required to decrypt channel credentials when sending. */
  CHANNEL_ENCRYPTION_KEY: z.string().optional(),
  /** Attempts per outbound webhook delivery before it is marked failed. */
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),

  /** Where report exports are written. Must match the API, or downloads 404. */
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(false),
  S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /** How often the metric rollup sweep runs. */
  METRICS_ROLLUP_INTERVAL_SECONDS: z.coerce.number().int().min(60).default(900),
  /** How many recent days each sweep recomputes. */
  METRICS_ROLLUP_DAYS: z.coerce.number().int().min(1).max(31).default(2),
});

export type WorkerEnv = z.infer<typeof schema>;

export function loadEnv(): WorkerEnv {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid worker environment:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
