import { createTestApp, resetDb, signupUser, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

const USER_TABLES: [table: string, column: string][] = [
  ['users', 'id'],
  ['credentials', 'user_id'],
  ['devices', 'user_id'],
  ['sessions', 'user_id'],
  ['otp_codes', 'user_id'],
  ['reports', 'reporter_id'],
];

async function countRows(userId: string) {
  const counts: Record<string, number> = {};
  for (const [table, col] of USER_TABLES) {
    const { rows } = await ctx.pool.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${col} = $1`,
      [userId],
    );
    counts[table] = rows[0].n;
  }
  return counts;
}

describe('DELETE /me', () => {
  it('removes every row belonging to the user and invalidates their tokens', async () => {
    const { auth, username, password } = await signupUser(ctx);
    const other = await signupUser(ctx);
    const bearer = `Bearer ${auth.accessToken}`;

    // Give the user data in every table.
    await ctx.http().post('/auth/login').send({ username, password }).expect(200);
    await ctx
      .http()
      .post('/auth/otp/request')
      .set('authorization', bearer)
      .send({ phone: '+14155550123' })
      .expect(202);
    await ctx.pool.query(
      `INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES ($1, $2, 'spam'), ($2, $1, 'spam')`,
      [auth.user.id, other.auth.user.id],
    );
    expect(Object.values(await countRows(auth.user.id)).every((n) => n > 0)).toBe(true);

    await ctx.http().delete('/me').set('authorization', bearer).send({ password }).expect(204);

    expect(await countRows(auth.user.id)).toEqual(
      Object.fromEntries(USER_TABLES.map(([t]) => [t, 0])),
    );
    // Reports *about* the deleted user are gone too.
    const about = await ctx.pool.query(
      'SELECT count(*)::int AS n FROM reports WHERE reported_user_id = $1',
      [auth.user.id],
    );
    expect(about.rows[0].n).toBe(0);

    await ctx.http().get('/me').set('authorization', bearer).expect(401);
    await ctx.http().post('/auth/refresh').send({ refreshToken: auth.refreshToken }).expect(401);
    await ctx.http().post('/auth/login').send({ username, password }).expect(401);

    // Other users are untouched.
    await ctx
      .http()
      .get('/me')
      .set('authorization', `Bearer ${other.auth.accessToken}`)
      .expect(200);
  });

  it('requires the correct password', async () => {
    const { auth } = await signupUser(ctx);
    const res = await ctx
      .http()
      .delete('/me')
      .set('authorization', `Bearer ${auth.accessToken}`)
      .send({ password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect((await countRows(auth.user.id)).users).toBe(1);
  });

  it('requires authentication', async () => {
    await ctx.http().delete('/me').send({ password: 'x' }).expect(401);
  });

  it('frees the username for reuse', async () => {
    const { auth, username, password } = await signupUser(ctx);
    await ctx
      .http()
      .delete('/me')
      .set('authorization', `Bearer ${auth.accessToken}`)
      .send({ password })
      .expect(204);
    await signupUser(ctx, { username });
  });
});
