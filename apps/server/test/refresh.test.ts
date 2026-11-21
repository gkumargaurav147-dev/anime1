import { createTestApp, resetDb, signupUser, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

describe('POST /auth/refresh', () => {
  it('issues a new token pair and rotates the refresh token', async () => {
    const { auth } = await signupUser(ctx);
    const res = await ctx
      .http()
      .post('/auth/refresh')
      .send({ refreshToken: auth.refreshToken })
      .expect(200);

    expect(res.body.refreshToken).not.toBe(auth.refreshToken);
    expect(res.body.user.id).toBe(auth.user.id);
    await ctx.http().get('/me').set('authorization', `Bearer ${res.body.accessToken}`).expect(200);
    // The old access token belonged to the rotated session.
    await ctx.http().get('/me').set('authorization', `Bearer ${auth.accessToken}`).expect(401);
  });

  it('detects reuse of a rotated refresh token and revokes all sessions', async () => {
    const { auth } = await signupUser(ctx);
    const rotated = (
      await ctx.http().post('/auth/refresh').send({ refreshToken: auth.refreshToken }).expect(200)
    ).body;

    // Replaying the old token (e.g. it was stolen) is rejected...
    await ctx.http().post('/auth/refresh').send({ refreshToken: auth.refreshToken }).expect(401);
    // ...and kills the legitimate new session too.
    await ctx.http().post('/auth/refresh').send({ refreshToken: rotated.refreshToken }).expect(401);
    await ctx.http().get('/me').set('authorization', `Bearer ${rotated.accessToken}`).expect(401);
  });

  it('rejects unknown and expired refresh tokens', async () => {
    const { auth } = await signupUser(ctx);
    const unknown = await ctx
      .http()
      .post('/auth/refresh')
      .send({ refreshToken: 'unknown-token' })
      .expect(401);
    expect(unknown.body.error.code).toBe('REFRESH_TOKEN_INVALID');

    await ctx.pool.query(`UPDATE sessions SET expires_at = now() - interval '1 second'`);
    await ctx.http().post('/auth/refresh').send({ refreshToken: auth.refreshToken }).expect(401);
  });

  it('stores only hashes of refresh tokens', async () => {
    const { auth } = await signupUser(ctx);
    const { rows } = await ctx.pool.query('SELECT refresh_token_hash FROM sessions');
    expect(rows.map((r) => r.refresh_token_hash)).not.toContain(auth.refreshToken);
  });
});
