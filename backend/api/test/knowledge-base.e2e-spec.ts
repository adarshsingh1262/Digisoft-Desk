import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';

/** Agent-side authoring plus what the help center actually serves to a reader. */
describe('Knowledge base (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let auth: { Authorization: string };
  let portalSlug: string;

  const createArticle = (body: Record<string, unknown>) =>
    request(http).post(apiPath('/kb/articles')).set(auth).send(body);

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma, harness.redis);
    const org = await registerOrg(http, 'kb');
    auth = { Authorization: `Bearer ${org.token}` };

    const helpCenter = await request(http).get(apiPath('/help-center')).set(auth).expect(200);
    portalSlug = helpCenter.body.data.slug as string;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('registers a help center with a knowledge base category for a new organization', async () => {
    const categories = await request(http).get(apiPath('/kb/categories')).set(auth).expect(200);
    expect(categories.body.data).toHaveLength(1);
    expect(categories.body.data[0]).toMatchObject({ slug: 'getting-started', visibility: 'PUBLIC' });
  });

  it('derives a unique slug from the title', async () => {
    const first = await createArticle({ title: 'Reset your password', body: 'Steps' }).expect(201);
    const second = await createArticle({ title: 'Reset your password', body: 'Other steps' }).expect(201);

    expect(first.body.data.slug).toBe('reset-your-password');
    expect(second.body.data.slug).toBe('reset-your-password-2');
  });

  it('serves published public articles to anonymous readers and hides everything else', async () => {
    await createArticle({ title: 'Public guide', body: 'Body', status: 'PUBLISHED' }).expect(201);
    await createArticle({ title: 'Still a draft', body: 'Body' }).expect(201);
    await createArticle({
      title: 'Internal runbook',
      body: 'Body',
      status: 'PUBLISHED',
      visibility: 'AGENTS_ONLY',
    }).expect(201);

    const portal = await request(http).get(apiPath(`/portal/${portalSlug}/kb/articles`)).expect(200);
    const titles = (portal.body.data as { title: string }[]).map((article) => article.title);
    expect(titles).toEqual(['Public guide']);
  });

  it('opens an article by slug, counts the view and returns it to a reader', async () => {
    await createArticle({
      title: 'How to export data',
      summary: 'CSV and JSON exports',
      body: '## Export\n\nUse the export button.',
      status: 'PUBLISHED',
    }).expect(201);

    const first = await request(http)
      .get(apiPath(`/portal/${portalSlug}/kb/articles/how-to-export-data`))
      .expect(200);
    expect(first.body.data.body).toContain('Use the export button');

    const second = await request(http)
      .get(apiPath(`/portal/${portalSlug}/kb/articles/how-to-export-data`))
      .expect(200);
    expect(second.body.data.viewCount).toBe(1);
  });

  it('ranks title matches above body matches when searching', async () => {
    await createArticle({ title: 'Billing overview', body: 'General information', status: 'PUBLISHED' }).expect(201);
    await createArticle({
      title: 'Shipping options',
      body: 'Contact billing if the invoice is wrong.',
      status: 'PUBLISHED',
    }).expect(201);

    const results = await request(http)
      .get(apiPath(`/portal/${portalSlug}/kb/search`))
      .query({ q: 'billing' })
      .expect(200);

    expect((results.body.data as { title: string }[]).map((article) => article.title)).toEqual([
      'Billing overview',
      'Shipping options',
    ]);
  });

  it('counts anonymous article feedback once per vote', async () => {
    const article = await createArticle({ title: 'Was this useful', body: 'Body', status: 'PUBLISHED' }).expect(201);
    const id = article.body.data.id as string;

    await request(http)
      .post(apiPath(`/portal/${portalSlug}/kb/articles/${id}/feedback`))
      .send({ isHelpful: true })
      .expect(200);
    const second = await request(http)
      .post(apiPath(`/portal/${portalSlug}/kb/articles/${id}/feedback`))
      .send({ isHelpful: false, comment: 'Needs screenshots' })
      .expect(200);

    expect(second.body.data).toMatchObject({ helpfulCount: 1, notHelpfulCount: 1 });

    const feedback = await request(http).get(apiPath(`/kb/articles/${id}/feedback`)).set(auth).expect(200);
    expect(feedback.body.data).toHaveLength(2);
  });

  it('unpublishing takes an article off the help center immediately', async () => {
    const article = await createArticle({ title: 'Temporary notice', body: 'Body', status: 'PUBLISHED' }).expect(201);
    const id = article.body.data.id as string;

    await request(http).post(apiPath(`/kb/articles/${id}/unpublish`)).set(auth).expect(201);

    await request(http).get(apiPath(`/portal/${portalSlug}/kb/articles/temporary-notice`)).expect(404);
  });

  it('keeps one organization out of the knowledge base of another', async () => {
    await createArticle({ title: 'Tenant one only', body: 'Body', status: 'PUBLISHED' }).expect(201);

    const other = await registerOrg(http, 'kb-two', 'owner@kb-two.example');
    const otherHelpCenter = await request(http)
      .get(apiPath('/help-center'))
      .set({ Authorization: `Bearer ${other.token}` })
      .expect(200);

    const articles = await request(http)
      .get(apiPath(`/portal/${otherHelpCenter.body.data.slug}/kb/articles`))
      .expect(200);
    expect(articles.body.data).toEqual([]);
  });
});
