import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';

/**
 * The customer-facing help center: web forms, portal accounts, requests and the
 * boundaries that keep a customer inside their own data.
 */
describe('Customer portal (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let auth: { Authorization: string };
  let slug: string;

  const portal = (path: string) => apiPath(`/portal/${slug}${path}`);

  const signUp = async (email = 'rhea@example.com') => {
    const response = await request(http)
      .post(portal('/auth/register'))
      .send({ firstName: 'Rhea', lastName: 'Kapoor', email, password: 'PortalPass123' })
      .expect(201);
    return { Authorization: `Bearer ${response.body.data.accessToken as string}` };
  };

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma, harness.redis);
    const org = await registerOrg(http, 'portal');
    auth = { Authorization: `Bearer ${org.token}` };
    const helpCenter = await request(http).get(apiPath('/help-center')).set(auth).expect(200);
    slug = helpCenter.body.data.slug as string;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('publishes a help center and a contact form for a new organization', async () => {
    const config = await request(http).get(portal('')).expect(200);
    expect(config.body.data).toMatchObject({ slug, kbEnabled: true, allowTicketSubmission: true });

    const forms = await request(http).get(portal('/forms')).expect(200);
    expect(forms.body.data).toHaveLength(1);
    expect(forms.body.data[0].slug).toBe('contact-support');
  });

  it('turns an anonymous form submission into a ticket with a contact', async () => {
    const submission = await request(http)
      .post(portal('/forms/contact-support/submit'))
      .send({
        values: {
          name: 'Rhea Kapoor',
          email: 'rhea@example.com',
          subject: 'Invoice will not download',
          description: 'The button does nothing in Safari.',
        },
      })
      .expect(201);

    expect(submission.body.data.ticketNumber).toBe(1);

    const tickets = await request(http).get(apiPath('/tickets')).set(auth).expect(200);
    expect(tickets.body.data[0]).toMatchObject({ subject: 'Invoice will not download', source: 'WEB_FORM' });
    expect(tickets.body.data[0].contact.email).toBe('rhea@example.com');
  });

  it('rejects a submission that misses a required field', async () => {
    const response = await request(http)
      .post(portal('/forms/contact-support/submit'))
      .send({ values: { name: 'Rhea' } })
      .expect(400);

    const paths = (response.body.error.details as { path: string }[]).map((issue) => issue.path);
    expect(paths).toContain('email');
    expect(paths).toContain('description');
  });

  it('accepts a honeypot submission without storing anything', async () => {
    await request(http)
      .post(portal('/forms/contact-support/submit'))
      .send({
        website: 'http://spam.example',
        values: { name: 'Bot', email: 'bot@example.com', subject: 'x', description: 'spam' },
      })
      .expect(201);

    const tickets = await request(http).get(apiPath('/tickets')).set(auth).expect(200);
    expect(tickets.body.data).toEqual([]);
  });

  it('adopts the contact an earlier submission created when that person signs up', async () => {
    await request(http)
      .post(portal('/forms/contact-support/submit'))
      .send({
        values: {
          name: 'Rhea Kapoor',
          email: 'rhea@example.com',
          subject: 'Earlier request',
          description: 'Raised before signing up.',
        },
      })
      .expect(201);

    const customer = await signUp();
    const mine = await request(http).get(portal('/tickets')).set(customer).expect(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].subject).toBe('Earlier request');
  });

  it('lets a customer raise, follow and close their own request', async () => {
    const customer = await signUp();

    const created = await request(http)
      .post(portal('/tickets'))
      .set(customer)
      .send({ subject: 'Export crashes', description: 'Above 500 rows the tab dies.' })
      .expect(201);
    const ticketId = created.body.data.id as string;
    expect(created.body.data.source).toBe('PORTAL');

    await request(http)
      .post(portal(`/tickets/${ticketId}/replies`))
      .set(customer)
      .send({ bodyText: 'It also happens in Firefox.' })
      .expect(200);

    const closed = await request(http).post(portal(`/tickets/${ticketId}/close`)).set(customer).expect(200);
    expect(closed.body.data.status.isClosed).toBe(true);
  });

  it('never shows an internal comment to the customer', async () => {
    const customer = await signUp();
    const created = await request(http)
      .post(portal('/tickets'))
      .set(customer)
      .send({ subject: 'Visible', description: 'Body' })
      .expect(201);
    const ticketId = created.body.data.id as string;

    await request(http)
      .post(apiPath(`/tickets/${ticketId}/comments`))
      .set(auth)
      .send({ bodyText: 'Internal only' })
      .expect(201);
    await request(http)
      .post(apiPath(`/tickets/${ticketId}/messages`))
      .set(auth)
      .send({ bodyText: 'We are on it.' })
      .expect(201);

    const detail = await request(http).get(portal(`/tickets/${ticketId}`)).set(customer).expect(200);
    const bodies = (detail.body.data.messages as { bodyText: string }[]).map((message) => message.bodyText);
    expect(bodies).toEqual(['We are on it.']);
  });

  it('reopens a resolved request when the customer replies again', async () => {
    const customer = await signUp();
    const created = await request(http)
      .post(portal('/tickets'))
      .set(customer)
      .send({ subject: 'Reopen me', description: 'Body' })
      .expect(201);
    const ticketId = created.body.data.id as string;

    await request(http)
      .post(apiPath(`/tickets/${ticketId}/resolve`))
      .set(auth)
      .send({ resolutionNote: 'Fixed' })
      .expect(200);

    const replied = await request(http)
      .post(portal(`/tickets/${ticketId}/replies`))
      .set(customer)
      .send({ bodyText: 'Still broken for me.' })
      .expect(200);

    expect(replied.body.data.status.isResolved).toBe(false);
  });

  it('keeps a customer out of a ticket that is not theirs', async () => {
    const customer = await signUp();
    const other = await request(http)
      .post(apiPath('/tickets'))
      .set(auth)
      .send({ subject: 'Someone else', description: 'Body' })
      .expect(201);

    await request(http).get(portal(`/tickets/${other.body.data.id as string}`)).set(customer).expect(404);
  });

  it('refuses a session issued by another help center', async () => {
    const customer = await signUp();
    const other = await registerOrg(http, 'portal-two', 'owner@portal-two.example');
    const otherHelpCenter = await request(http)
      .get(apiPath('/help-center'))
      .set({ Authorization: `Bearer ${other.token}` })
      .expect(200);

    await request(http)
      .get(apiPath(`/portal/${otherHelpCenter.body.data.slug as string}/tickets`))
      .set(customer)
      .expect(403);
  });

  it('hides everything from anonymous visitors once public browsing is off', async () => {
    await request(http).patch(apiPath('/help-center')).set(auth).send({ allowPublicBrowsing: false }).expect(200);

    await request(http).get(portal('/kb/articles')).expect(401);
    // Signing in must still be possible, or nobody could ever get in.
    await request(http)
      .post(portal('/auth/login'))
      .send({ email: 'nobody@example.com', password: 'WrongPassword1' })
      .expect(401)
      .expect((response) => expect(response.body.error.code).toBe('INVALID_CREDENTIALS'));
  });

  it('takes the whole help center down when it is unpublished', async () => {
    await request(http).patch(apiPath('/help-center')).set(auth).send({ isPublished: false }).expect(200);
    await request(http).get(portal('')).expect(404);
  });

  it('refuses a second account for the same email address', async () => {
    await signUp();
    await request(http)
      .post(portal('/auth/register'))
      .send({ firstName: 'Rhea', email: 'rhea@example.com', password: 'PortalPass123' })
      .expect(409);
  });

  it('refuses sign-up when the help center does not allow it', async () => {
    await request(http).patch(apiPath('/help-center')).set(auth).send({ allowSelfRegistration: false }).expect(200);
    await request(http)
      .post(portal('/auth/register'))
      .send({ firstName: 'Nope', email: 'nope@example.com', password: 'PortalPass123' })
      .expect(403);
  });
});
