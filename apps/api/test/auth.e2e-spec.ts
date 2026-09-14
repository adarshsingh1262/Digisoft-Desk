import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, resetDatabase, type Harness } from './app.harness';

const ORG = {
  organizationName: 'Auth Test Co',
  organizationSlug: 'auth-test',
  firstName: 'Ada',
  lastName: 'Admin',
  email: 'ada@auth-test.example',
  password: 'Str0ngPassword1',
};

describe('Authentication (e2e)', () => {
  let harness: Harness;
  let http: Server;

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
  });

  afterAll(async () => {
    await harness.close();
  });

  const register = () => request(http).post(apiPath('/auth/register')).send(ORG);

  it('provisions an organization, its system roles and a super admin on registration', async () => {
    const response = await register().expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(ORG.email);
    expect(response.body.data.user.roles).toEqual(['SUPER_ADMIN']);
    expect(response.body.data.accessToken).toEqual(expect.any(String));

    const roles = await harness.prisma.role.findMany({ select: { systemKey: true } });
    expect(roles.map((r) => r.systemKey).sort()).toEqual([
      'ADMIN',
      'AGENT',
      'CUSTOMER',
      'LIGHT_AGENT',
      'SUPER_ADMIN',
    ]);

    // A default department and business hours make the organization immediately usable.
    expect(await harness.prisma.department.count({ where: { isDefault: true } })).toBe(1);
    expect(await harness.prisma.businessHours.count({ where: { isDefault: true } })).toBe(1);
  });

  it('never stores the password in recoverable form', async () => {
    await register().expect(201);
    const user = await harness.prisma.user.findFirstOrThrow({ select: { passwordHash: true } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(ORG.password);
  });

  it('rejects a duplicate organization address', async () => {
    await register().expect(201);
    const response = await request(http)
      .post(apiPath('/auth/register'))
      .send({ ...ORG, email: 'other@auth-test.example' })
      .expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects a weak password before any record is written', async () => {
    const response = await request(http)
      .post(apiPath('/auth/register'))
      .send({ ...ORG, password: 'short' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await harness.prisma.organization.count()).toBe(0);
  });

  describe('once registered', () => {
    beforeEach(async () => {
      await register().expect(201);
    });

    it('signs in with the right password and sets an http-only refresh cookie', async () => {
      const response = await request(http)
        .post(apiPath('/auth/login'))
        .send({ email: ORG.email, password: ORG.password })
        .expect(200);

      expect(response.body.data.user.permissions).toContain('contact.read');

      const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toContain('ds_refresh=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      // The refresh cookie is scoped to the auth routes, not the whole API.
      expect(cookie).toContain('Path=/api/v1/auth');
    });

    it('gives the same answer for a wrong password and an unknown address', async () => {
      const wrongPassword = await request(http)
        .post(apiPath('/auth/login'))
        .send({ email: ORG.email, password: 'Wr0ngPassword1' })
        .expect(401);
      const unknownUser = await request(http)
        .post(apiPath('/auth/login'))
        .send({ email: 'nobody@auth-test.example', password: 'Wr0ngPassword1' })
        .expect(401);

      expect(wrongPassword.body.error).toEqual(unknownUser.body.error);
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('rotates the refresh token and revokes the family when a used token is replayed', async () => {
      const login = await request(http)
        .post(apiPath('/auth/login'))
        .send({ email: ORG.email, password: ORG.password })
        .expect(200);
      const firstCookie = (login.headers['set-cookie'] as unknown as string[])[0] as string;

      const refreshed = await request(http)
        .post(apiPath('/auth/refresh'))
        .set('Cookie', firstCookie)
        .expect(200);
      const secondCookie = (refreshed.headers['set-cookie'] as unknown as string[])[0] as string;
      expect(secondCookie).not.toEqual(firstCookie);

      const replay = await request(http)
        .post(apiPath('/auth/refresh'))
        .set('Cookie', firstCookie)
        .expect(401);
      expect(replay.body.error.code).toBe('TOKEN_EXPIRED');

      // The whole family is dropped, so the rotated token is dead too.
      await request(http).post(apiPath('/auth/refresh')).set('Cookie', secondCookie).expect(401);
    });

    it('answers forgot-password identically for known and unknown addresses', async () => {
      const known = await request(http)
        .post(apiPath('/auth/forgot-password'))
        .send({ email: ORG.email })
        .expect(200);
      const unknown = await request(http)
        .post(apiPath('/auth/forgot-password'))
        .send({ email: 'ghost@auth-test.example' })
        .expect(200);

      expect(known.body).toEqual(unknown.body);
      expect(await harness.prisma.verificationToken.count({ where: { type: 'PASSWORD_RESET' } })).toBe(1);
    });

    it('rejects an unknown, tampered or missing access token', async () => {
      const login = await request(http)
        .post(apiPath('/auth/login'))
        .send({ email: ORG.email, password: ORG.password })
        .expect(200);
      const token = login.body.data.accessToken as string;

      await request(http).get(apiPath('/auth/me')).expect(401);
      await request(http).get(apiPath('/auth/me')).set('Authorization', `Bearer ${token}x`).expect(401);
      await request(http).get(apiPath('/auth/me')).set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('revokes every session when the password is changed', async () => {
      const login = await request(http)
        .post(apiPath('/auth/login'))
        .send({ email: ORG.email, password: ORG.password })
        .expect(200);
      const cookie = (login.headers['set-cookie'] as unknown as string[])[0] as string;

      await request(http)
        .post(apiPath('/auth/change-password'))
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({ currentPassword: ORG.password, newPassword: 'An0therPassword2' })
        .expect(200);

      await request(http).post(apiPath('/auth/refresh')).set('Cookie', cookie).expect(401);
      await request(http)
        .post(apiPath('/auth/login'))
        .send({ email: ORG.email, password: ORG.password })
        .expect(401);
      await request(http)
        .post(apiPath('/auth/login'))
        .send({ email: ORG.email, password: 'An0therPassword2' })
        .expect(200);
    });
  });
});
