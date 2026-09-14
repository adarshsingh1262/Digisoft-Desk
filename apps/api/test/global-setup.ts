import { execSync } from 'node:child_process';
import * as path from 'node:path';

// globalSetup runs before setupFiles, so apply the same test defaults here.
require('./jest-setup-env');

/** Applies migrations to the test database before the e2e suites run. */
export default function globalSetup(): void {
  const dbPackage = path.resolve(__dirname, '../../../packages/db');
  execSync('npx prisma migrate deploy', {
    cwd: dbPackage,
    stdio: 'inherit',
    env: process.env,
  });
}
