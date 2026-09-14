import request from 'supertest';
import type { Server } from 'node:http';

// The environment is read when the application module is first evaluated, so the flag
// has to be set before the harness (and through it, AppModule) is required.
process.env.THROTTLE_ENABLED = 'true';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const harnessModule = require('./app.harness') as typeof import('./app.harness');
const { apiPath, createHarness, resetDatabase } = harnessModule;

/** The one suite that keeps the real ThrottlerGuard in play. */
describe('Rate limiting (e2e)', () => {
  let harness: Awaited<ReturnType<typeof createHarness>>;
  let http: Server;

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
    await resetDatabase(harness.prisma);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('throttles repeated failed logins instead of letting them run unbounded', async () => {
    const attempt = () =>
      request(http)
        .post(apiPath('/auth/login'))
        .send({ email: 'someone@example.test', password: 'Wr0ngPassword1' });

    const statuses: number[] = [];
    for (let i = 0; i < 14; i += 1) {
      statuses.push((await attempt()).status);
    }

    expect(statuses).toContain(401);
    expect(statuses).toContain(429);
    // The limiter bites well before a dozen attempts get through.
    expect(statuses.filter((status) => status === 401).length).toBeLessThanOrEqual(10);
  });
});
