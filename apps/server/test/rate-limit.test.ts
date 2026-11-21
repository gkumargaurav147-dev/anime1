import { createTestApp, newDeviceId, resetDb, signupUser, type TestCtx } from './helpers';

describe('rate limiting on auth routes', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp({ AUTH_RATE_LIMIT_MAX: 3, AUTH_RATE_LIMIT_WINDOW_MS: 60_000 });
    await resetDb(ctx.pool);
  });
  afterAll(() => ctx.close());

  it('returns 429 after the limit on /auth/login', async () => {
    for (let i = 0; i < 3; i++) {
      await ctx
        .http()
        .post('/auth/login')
        .send({ username: 'nobody', password: 'password1' })
        .expect(401);
    }
    const res = await ctx
      .http()
      .post('/auth/login')
      .send({ username: 'nobody', password: 'password1' })
      .expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('limits /age-gate so ages cannot be brute-forced across devices', async () => {
    for (let i = 0; i < 3; i++) {
      await ctx
        .http()
        .post('/age-gate')
        .set('x-device-id', newDeviceId())
        .send({ birthYear: 1990, birthMonth: 1, birthDay: 1 })
        .expect(200);
    }
    await ctx
      .http()
      .post('/age-gate')
      .set('x-device-id', newDeviceId())
      .send({ birthYear: 1990, birthMonth: 1, birthDay: 1 })
      .expect(429);
  });

  it('counts each route separately and leaves non-auth routes alone', async () => {
    // /auth/refresh still has its own budget.
    await ctx.http().post('/auth/refresh').send({ refreshToken: 'x' }).expect(401);
    for (let i = 0; i < 10; i++) await ctx.http().get('/health').expect(200);
  });
});

describe('rate limiting on signup', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp({ AUTH_RATE_LIMIT_MAX: 2 });
    await resetDb(ctx.pool);
  });
  afterAll(() => ctx.close());

  it('returns 429 after the limit on /auth/signup', async () => {
    await ctx.http().post('/auth/signup').set('x-device-id', newDeviceId()).send({}).expect(400);
    await ctx.http().post('/auth/signup').set('x-device-id', newDeviceId()).send({}).expect(400);
    await ctx.http().post('/auth/signup').set('x-device-id', newDeviceId()).send({}).expect(429);
  });
});

const redisUrl = process.env.TEST_REDIS_URL;
(redisUrl ? describe : describe.skip)('rate limiting with the Redis store', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp({ AUTH_RATE_LIMIT_MAX: 2, REDIS_URL: redisUrl });
    await resetDb(ctx.pool);
  });
  afterAll(() => ctx.close());

  it('enforces the limit using Redis', async () => {
    // Use a unique username so a previous run's counters don't matter.
    const { username } = await signupUser(ctx).catch(() => ({ username: 'x' }));
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (await ctx.http().post('/auth/login').send({ username, password: 'bad-password' })).status,
      );
    }
    expect(statuses).toContain(429);
  });
});
