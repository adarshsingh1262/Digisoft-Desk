import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, resetDatabase, type Harness } from './app.harness';

interface Tenant {
  token: string;
  organizationId: string;
  contactId: string;
  accountId: string;
  departmentId: string;
}

/**
 * The isolation guarantee this suite defends: a user of organization A must not be
 * able to read, change or even detect the existence of organization B's records.
 */
describe('Tenant isolation (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let alpha: Tenant;
  let beta: Tenant;

  const registerTenant = async (slug: string): Promise<Tenant> => {
    const register = await request(http)
      .post(apiPath('/auth/register'))
      .send({
        organizationName: `${slug} Co`,
        organizationSlug: slug,
        firstName: 'Owner',
        lastName: slug,
        email: `owner@${slug}.example`,
        password: 'Str0ngPassword1',
      })
      .expect(201);

    const token = register.body.data.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    const account = await request(http)
      .post(apiPath('/accounts'))
      .set(auth)
      .send({ name: `${slug} Customer Ltd` })
      .expect(201);

    const contact = await request(http)
      .post(apiPath('/contacts'))
      .set(auth)
      .send({
        firstName: 'Casey',
        lastName: slug,
        email: `casey@${slug}.example`,
        accountId: account.body.data.id,
      })
      .expect(201);

    const departments = await request(http).get(apiPath('/departments')).set(auth).expect(200);

    return {
      token,
      organizationId: register.body.data.user.organizationId,
      contactId: contact.body.data.id,
      accountId: account.body.data.id,
      departmentId: departments.body.data[0].id,
    };
  };

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    alpha = await registerTenant('alpha');
    beta = await registerTenant('beta');
  });

  afterAll(async () => {
    await harness.close();
  });

  const asBeta = () => ({ Authorization: `Bearer ${beta.token}` });
  const asAlpha = () => ({ Authorization: `Bearer ${alpha.token}` });

  it('gives each organization its own separate records', () => {
    expect(alpha.organizationId).not.toEqual(beta.organizationId);
  });

  it('lists only the caller organization\'s contacts and accounts', async () => {
    const contacts = await request(http).get(apiPath('/contacts')).set(asBeta()).expect(200);
    expect(contacts.body.meta.total).toBe(1);
    expect(contacts.body.data[0].id).toBe(beta.contactId);

    const accounts = await request(http).get(apiPath('/accounts')).set(asBeta()).expect(200);
    expect(accounts.body.meta.total).toBe(1);
    expect(accounts.body.data[0].id).toBe(beta.accountId);
  });

  it('returns 404 — not 403 — when reading another organization\'s record by id', async () => {
    // 404 keeps record ids unenumerable: a wrong tenant cannot tell "exists elsewhere"
    // apart from "does not exist".
    await request(http).get(apiPath(`/contacts/${alpha.contactId}`)).set(asBeta()).expect(404);
    await request(http).get(apiPath(`/accounts/${alpha.accountId}`)).set(asBeta()).expect(404);
    await request(http).get(apiPath(`/departments/${alpha.departmentId}`)).set(asBeta()).expect(404);
  });

  it('refuses to update another organization\'s records and leaves them untouched', async () => {
    await request(http)
      .patch(apiPath(`/contacts/${alpha.contactId}`))
      .set(asBeta())
      .send({ firstName: 'Tampered' })
      .expect(404);

    const contact = await harness.prisma.contact.findUniqueOrThrow({
      where: { id: alpha.contactId },
      select: { firstName: true },
    });
    expect(contact.firstName).toBe('Casey');
  });

  it('refuses to delete another organization\'s records', async () => {
    await request(http).delete(apiPath(`/contacts/${alpha.contactId}`)).set(asBeta()).expect(404);
    await request(http).delete(apiPath(`/accounts/${alpha.accountId}`)).set(asBeta()).expect(404);

    const contact = await harness.prisma.contact.findUniqueOrThrow({
      where: { id: alpha.contactId },
      select: { deletedAt: true },
    });
    expect(contact.deletedAt).toBeNull();
  });

  it('will not link a new contact to another organization\'s account', async () => {
    await request(http)
      .post(apiPath('/contacts'))
      .set(asBeta())
      .send({ firstName: 'Mallory', accountId: alpha.accountId })
      .expect(404);
  });

  it('will not assign a user to another organization\'s department or role', async () => {
    const betaUser = await harness.prisma.user.findFirstOrThrow({
      where: { organizationId: beta.organizationId },
      select: { id: true },
    });
    const alphaRole = await harness.prisma.role.findFirstOrThrow({
      where: { organizationId: alpha.organizationId, systemKey: 'AGENT' },
      select: { id: true },
    });

    await request(http)
      .patch(apiPath(`/users/${betaUser.id}/departments`))
      .set(asBeta())
      .send({ departmentIds: [alpha.departmentId] })
      .expect(400);

    await request(http)
      .patch(apiPath(`/users/${betaUser.id}/roles`))
      .set(asBeta())
      .send({ roleIds: [alphaRole.id] })
      .expect(400);
  });

  it('scopes search so a query never reaches across the boundary', async () => {
    const response = await request(http)
      .get(apiPath('/contacts?q=casey@alpha.example'))
      .set(asBeta())
      .expect(200);
    expect(response.body.meta.total).toBe(0);
  });

  it('keeps audit history separated by organization', async () => {
    const alphaLogs = await harness.prisma.auditLog.findMany({
      where: { organizationId: alpha.organizationId },
      select: { entityId: true },
    });
    expect(alphaLogs.length).toBeGreaterThan(0);
    expect(alphaLogs.every((log) => log.entityId !== beta.contactId)).toBe(true);
  });

  it('still lets each organization reach its own records', async () => {
    await request(http).get(apiPath(`/contacts/${alpha.contactId}`)).set(asAlpha()).expect(200);
    await request(http).get(apiPath(`/contacts/${beta.contactId}`)).set(asBeta()).expect(200);
  });
});
