import type { PrismaClient } from '@digisoft/db';

/**
 * What the assistant needs from its host. Both hosts — the API and the worker — pass an
 * **unscoped** Prisma client, so every query here names `organizationId` explicitly: the
 * worker has no request and therefore no tenant context to lean on.
 */
export interface AiDeps {
  prisma: PrismaClient;
  /** Same key channel credentials use; needed to read the provider API key. */
  encryptionKey?: string;
  log?: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;
}
