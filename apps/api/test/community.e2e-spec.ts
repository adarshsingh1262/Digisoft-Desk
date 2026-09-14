import request from 'supertest';
import type { Server } from 'node:http';
import { apiPath, createHarness, registerOrg, resetDatabase, type Harness } from './app.harness';

/** Customer-facing community plus the agent moderation queue behind it. */
describe('Community (e2e)', () => {
  let harness: Harness;
  let http: Server;
  let auth: { Authorization: string };
  let slug: string;
  let categoryId: string;

  const portal = (path: string) => apiPath(`/portal/${slug}${path}`);

  const signUp = async (email = 'rhea@example.com') => {
    const response = await request(http)
      .post(portal('/auth/register'))
      .send({ firstName: 'Rhea', lastName: 'Kapoor', email, password: 'PortalPass123' })
      .expect(201);
    return { Authorization: `Bearer ${response.body.data.accessToken as string}` };
  };

  const postTopic = (headers: { Authorization: string }, overrides: Record<string, unknown> = {}) =>
    request(http)
      .post(portal('/community/topics'))
      .set(headers)
      .send({ categoryId, title: 'Can I export more than 500 rows?', body: 'Exports fail above 500.', ...overrides });

  beforeAll(async () => {
    harness = await createHarness();
    http = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma, harness.redis);
    const org = await registerOrg(http, 'community');
    auth = { Authorization: `Bearer ${org.token}` };
    const helpCenter = await request(http).get(apiPath('/help-center')).set(auth).expect(200);
    slug = helpCenter.body.data.slug as string;

    const categories = await request(http).get(portal('/community/categories')).expect(200);
    categoryId = categories.body.data[0].id as string;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('publishes a customer topic straight away when moderation is off', async () => {
    const customer = await signUp();
    const topic = await postTopic(customer).expect(201);
    expect(topic.body.data).toMatchObject({ moderation: 'PUBLISHED', status: 'OPEN' });

    const anonymous = await request(http).get(portal('/community/topics')).expect(200);
    expect(anonymous.body.data).toHaveLength(1);
  });

  it('holds a customer topic for review when moderation is on, showing it only to its author', async () => {
    await request(http).patch(apiPath('/help-center')).set(auth).send({ moderateCommunity: true }).expect(200);
    const customer = await signUp();
    const topic = await postTopic(customer).expect(201);
    expect(topic.body.data.moderation).toBe('PENDING');

    const anonymous = await request(http).get(portal('/community/topics')).expect(200);
    expect(anonymous.body.data).toEqual([]);

    const mine = await request(http).get(portal('/community/topics')).set(customer).expect(200);
    expect(mine.body.data).toHaveLength(1);

    await request(http)
      .patch(apiPath(`/community/topics/${topic.body.data.id as string}/moderate`))
      .set(auth)
      .send({ moderation: 'PUBLISHED' })
      .expect(200);

    const afterApproval = await request(http).get(portal('/community/topics')).expect(200);
    expect(afterApproval.body.data).toHaveLength(1);
  });

  it('marks the topic answered when its author accepts an agent reply', async () => {
    const customer = await signUp();
    const topic = await postTopic(customer).expect(201);
    const topicId = topic.body.data.id as string;

    const reply = await request(http)
      .post(apiPath(`/community/topics/${topicId}/replies`))
      .set(auth)
      .send({ body: 'The legacy exporter caps at 500 rows.' })
      .expect(201);

    await request(http)
      .post(portal(`/community/replies/${reply.body.data.id as string}/accept`))
      .set(customer)
      .expect(200);

    const detail = await request(http).get(portal(`/community/topics/${topicId}`)).expect(200);
    expect(detail.body.data.status).toBe('ANSWERED');
    expect(detail.body.data.replies[0]).toMatchObject({ isAnswer: true });
  });

  it('counts an upvote once and takes it back when clicked again', async () => {
    const customer = await signUp();
    const topic = await postTopic(customer).expect(201);
    const topicId = topic.body.data.id as string;

    const first = await request(http).post(portal(`/community/topics/${topicId}/vote`)).set(customer).expect(200);
    expect(first.body.data).toEqual({ voted: true, voteCount: 1 });

    const second = await request(http).post(portal(`/community/topics/${topicId}/vote`)).set(customer).expect(200);
    expect(second.body.data).toEqual({ voted: false, voteCount: 0 });
  });

  it('keeps replies out of a locked topic', async () => {
    const customer = await signUp();
    const topic = await postTopic(customer).expect(201);
    const topicId = topic.body.data.id as string;

    await request(http)
      .patch(apiPath(`/community/topics/${topicId}/moderate`))
      .set(auth)
      .send({ isLocked: true })
      .expect(200);

    await request(http)
      .post(portal(`/community/topics/${topicId}/replies`))
      .set(customer)
      .send({ body: 'One more thing' })
      .expect(400);
  });

  it('refuses to edit another customer topic', async () => {
    const author = await signUp();
    const other = await signUp('sam@example.com');
    const topic = await postTopic(author).expect(201);

    await request(http)
      .patch(portal(`/community/topics/${topic.body.data.id as string}`))
      .set(other)
      .send({ title: 'Hijacked title' })
      .expect(403);
  });

  it('hides the community entirely when the help center switches it off', async () => {
    await request(http).patch(apiPath('/help-center')).set(auth).send({ communityEnabled: false }).expect(200);
    await request(http).get(portal('/community/topics')).expect(404);
  });
});
