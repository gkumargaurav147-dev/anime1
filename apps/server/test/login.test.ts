import { createTestApp, resetDb, signupUser, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

describe('POST /auth/login', () => {
  it('logs in with the right password (username is case-insensitive)', async () => {
    const { username, password, auth } = await signupUser(ctx);
    const res = await ctx
      .http()
      .post('/auth/login')
      .send({ username: username.toUpperCase(), password })
      .expect(200);
    expect(res.body.user.id).toBe(auth.user.id);
    expect(res.body.accessToken).toEqual(expect.any(String));

    const me = await ctx
      .http()
      .get('/me')
      .set('authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(me.body.user.username).toBe(username);
  });

  it('rejects a wrong password and an unknown user with the same error', async () => {
    const { username } = await signupUser(ctx);
    const wrong = await ctx
      .http()
      .post('/auth/login')
      .send({ username, password: 'nope-nope-nope' })
      .expect(401);
    const unknown = await ctx
      .http()
      .post('/auth/login')
      .send({ username: 'ghost_user', password: 'whatever1' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects requests without a valid access token', async () => {
    await ctx.http().get('/me').expect(401);
    await ctx.http().get('/me').set('authorization', 'Bearer garbage').expect(401);
  });
});

describe('logout', () => {
  it('logout revokes only the current session', async () => {
    const { username, password, auth: a } = await signupUser(ctx);
    const b = (await ctx.http().post('/auth/login').send({ username, password }).expect(200)).body;

    await ctx
      .http()
      .post('/auth/logout')
      .set('authorization', `Bearer ${a.accessToken}`)
      .expect(204);

    await ctx.http().get('/me').set('authorization', `Bearer ${a.accessToken}`).expect(401);
    await ctx.http().post('/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await ctx.http().get('/me').set('authorization', `Bearer ${b.accessToken}`).expect(200);
  });

  it('logout-all revokes every device', async () => {
    const { username, password, auth: a } = await signupUser(ctx);
    const b = (await ctx.http().post('/auth/login').send({ username, password }).expect(200)).body;

    await ctx
      .http()
      .post('/auth/logout-all')
      .set('authorization', `Bearer ${b.accessToken}`)
      .expect(204);

    for (const s of [a, b]) {
      await ctx.http().get('/me').set('authorization', `Bearer ${s.accessToken}`).expect(401);
      await ctx.http().post('/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    }
  });
});
