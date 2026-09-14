import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import { PrismaClient } from '@digisoft/db';
import { AppModule } from '../src/app.module';
import { AppConfig } from '../src/config/config.module';
import { REDIS_CLIENT } from '../src/redis/redis.module';

export interface Harness {
  app: INestApplication;
  prisma: PrismaClient;
  close: () => Promise<void>;
}

/**
 * Boots the real application against the test database — no mocked layers.
 * Rate limiting follows THROTTLE_ENABLED, which the jest setup turns off so suites
 * can replay the same route; rate-limit.e2e-spec.ts turns it back on for itself.
 */
export async function createHarness(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  const config = app.get(AppConfig);
  app.setGlobalPrefix(config.get('API_PREFIX'));
  app.use(cookieParser());
  await app.init();

  const prisma = new PrismaClient();
  const redis = app.get<Redis>(REDIS_CLIENT);

  return {
    app,
    prisma,
    close: async () => {
      await app.close();
      await prisma.$disconnect();
      await redis.quit().catch(() => undefined);
    },
  };
}

/** Wipes every table between suites so each one starts from a known state. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs, notifications, verification_tokens, refresh_tokens,
      team_members, teams, user_departments, departments,
      user_roles, role_permissions, roles,
      contacts, accounts, holidays, business_hours, users, organizations
    RESTART IDENTITY CASCADE;
  `);
}

export const apiPath = (path: string): string => `/api/v1${path}`;
