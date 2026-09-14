import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, resetDatabase, type Harness } from './app.harness';

describe('Role-based access control (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let adminToken: string;
  let agentToken: string;
  let contactId: string;

  const login = async (email: string, password: string): Promise<string> => {
    const response = await request(http)
      .post(apiPath('/auth/login'))
      .send({ email, password, organizationSlug: 'rbac' })
      .expect(200);
    return response.body.data.accessToken as string;
  };

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);

    const register = await request(http)
      .post(apiPath('/auth/register'))
      .send({
        organizationName: 'RBAC Co',
        organizationSlug: 'rbac',
        firstName: 'Ada',
        lastName: 'Admin',
        email: 'ada@rbac.example',
        password: 'Str0ngPassword1',
      })
      .expect(201);
    adminToken = register.body.data.accessToken as string;

    const roles = await request(http)
      .get(apiPath('/roles'))
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const agentRoleId = (roles.body.data as { id: string; systemKey: string }[]).find(
      (role) => role.systemKey === 'AGENT',
    )!.id;

    await request(http)
      .post(apiPath('/users'))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Alex',
        lastName: 'Agent',
        email: 'alex@rbac.example',
        password: 'Str0ngPassword1',
        roleIds: [agentRoleId],
      })
      .expect(201);
    agentToken = await login('alex@rbac.example', 'Str0ngPassword1');

    const contact = await request(http)
      .post(apiPath('/contacts'))
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firstName: 'Casey', lastName: 'Customer' })
      .expect(201);
    contactId = contact.body.data.id;
  });

  afterAll(async () => {
    await harness.close();
  });

  const asAgent = () => ({ Authorization: `Bearer ${agentToken}` });
  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

  it('grants an agent the read and write permissions its role carries', async () => {
    await request(http).get(apiPath('/contacts')).set(asAgent()).expect(200);
    await request(http)
      .post(apiPath('/contacts'))
      .set(asAgent())
      .send({ firstName: 'New', lastName: 'Contact' })
      .expect(201);
  });

  it('refuses the permissions its role does not carry', async () => {
    const deletion = await request(http)
      .delete(apiPath(`/contacts/${contactId}`))
      .set(asAgent())
      .expect(403);
    expect(deletion.body.error.code).toBe('PERMISSION_DENIED');

    await request(http).get(apiPath('/roles')).set(asAgent()).expect(403);
    await request(http)
      .patch(apiPath('/organizations/current'))
      .set(asAgent())
      .send({ name: 'Renamed' })
      .expect(403);
  });

  it('applies a role change without waiting for the access token to expire', async () => {
    await request(http).get(apiPath('/roles')).set(asAgent()).expect(403);

    const agent = await harness.prisma.user.findFirstOrThrow({
      where: { email: 'alex@rbac.example' },
      select: { id: true },
    });
    const adminRole = await harness.prisma.role.findFirstOrThrow({
      where: { systemKey: 'ADMIN' },
      select: { id: true },
    });

    await request(http)
      .patch(apiPath(`/users/${agent.id}/roles`))
      .set(asAdmin())
      .send({ roleIds: [adminRole.id] })
      .expect(200);

    // Same token as before — the guard re-resolves permissions, so the change is live.
    await request(http).get(apiPath('/roles')).set(asAgent()).expect(200);
  });

  it('stops a deactivated user immediately, with their existing token', async () => {
    const agent = await harness.prisma.user.findFirstOrThrow({
      where: { email: 'alex@rbac.example' },
      select: { id: true },
    });

    await request(http)
      .post(apiPath(`/users/${agent.id}/deactivate`))
      .set(asAdmin())
      .expect(200);

    const response = await request(http).get(apiPath('/contacts')).set(asAgent()).expect(401);
    expect(response.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('protects system roles from being edited or deleted', async () => {
    const roles = await request(http).get(apiPath('/roles')).set(asAdmin()).expect(200);
    const agentRole = (roles.body.data as { id: string; systemKey: string }[]).find(
      (role) => role.systemKey === 'AGENT',
    )!;

    await request(http)
      .patch(apiPath(`/roles/${agentRole.id}`))
      .set(asAdmin())
      .send({ permissionKeys: ['contact.delete'] })
      .expect(400);

    await request(http).delete(apiPath(`/roles/${agentRole.id}`)).set(asAdmin()).expect(400);
  });

  it('supports a custom role built from the permission catalogue', async () => {
    const created = await request(http)
      .post(apiPath('/roles'))
      .set(asAdmin())
      .send({
        name: 'Contact Auditor',
        permissionKeys: ['contact.read', 'audit.read'],
      })
      .expect(201);

    expect(created.body.data.permissions.map((p: { permission: { key: string } }) => p.permission.key).sort()).toEqual(
      ['audit.read', 'contact.read'],
    );

    await request(http)
      .post(apiPath('/roles'))
      .set(asAdmin())
      .send({ name: 'Bogus', permissionKeys: ['contact.obliterate'] })
      .expect(400);
  });
});
