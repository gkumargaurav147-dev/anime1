import { ageGate, createTestApp, newDeviceId, resetDb, signupUser, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

describe('POST /auth/signup', () => {
  it('creates an adult account and stores only birth year + bracket', async () => {
    const { auth, username } = await signupUser(ctx, { age: 18 });

    expect(auth.accessToken).toEqual(expect.any(String));
    expect(auth.refreshToken).toEqual(expect.any(String));
    expect(auth.user).toMatchObject({ username, ageBracket: 'adult', isTeen: false });

    const { rows } = await ctx.pool.query('SELECT * FROM users WHERE id = $1', [auth.user.id]);
    expect(rows[0].birth_year).toBe(new Date().getUTCFullYear() - 18 - (isJan1() ? 1 : 0));
    expect(rows[0].age_bracket).toBe('adult');
    // No full date of birth column exists at all.
    expect(Object.keys(rows[0])).not.toEqual(
      expect.arrayContaining(['birth_date', 'date_of_birth', 'dob']),
    );
  });

  it('flags a 15-year-old as a teen', async () => {
    const { auth } = await signupUser(ctx, { age: 15 });
    expect(auth.user).toMatchObject({ ageBracket: 'teen', isTeen: true });
  });

  it('treats 13 and 17 as teens, 18 as adult', async () => {
    expect((await signupUser(ctx, { age: 13 })).auth.user.ageBracket).toBe('teen');
    expect((await signupUser(ctx, { age: 17 })).auth.user.ageBracket).toBe('teen');
    expect((await signupUser(ctx, { age: 18 })).auth.user.ageBracket).toBe('adult');
  });

  it('hashes passwords with argon2id', async () => {
    const { auth, password } = await signupUser(ctx);
    const { rows } = await ctx.pool.query(
      'SELECT password_hash FROM credentials WHERE user_id = $1',
      [auth.user.id],
    );
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0].password_hash).not.toContain(password);
  });

  it('rejects duplicate usernames case-insensitively', async () => {
    await signupUser(ctx, { username: 'Sakura' });
    const deviceId = newDeviceId();
    const gate = await ageGate(ctx, deviceId, 20).expect(200);
    const res = await ctx
      .http()
      .post('/auth/signup')
      .set('x-device-id', deviceId)
      .send({ username: 'sakura', password: 'another-password', ageToken: gate.body.ageToken })
      .expect(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('requires an age token from the age gate', async () => {
    const res = await ctx
      .http()
      .post('/auth/signup')
      .set('x-device-id', newDeviceId())
      .send({ username: 'no_gate', password: 'password123', ageToken: 'not-a-token' })
      .expect(400);
    expect(res.body.error.code).toBe('AGE_TOKEN_INVALID');
  });

  it('rejects an age token issued to a different device', async () => {
    const gate = await ageGate(ctx, newDeviceId(), 20).expect(200);
    const res = await ctx
      .http()
      .post('/auth/signup')
      .set('x-device-id', newDeviceId())
      .send({ username: 'other_dev', password: 'password123', ageToken: gate.body.ageToken })
      .expect(400);
    expect(res.body.error.code).toBe('AGE_TOKEN_INVALID');
  });

  it('validates username and password', async () => {
    const deviceId = newDeviceId();
    const gate = await ageGate(ctx, deviceId, 20).expect(200);
    const res = await ctx
      .http()
      .post('/auth/signup')
      .set('x-device-id', deviceId)
      .send({ username: 'a b', password: 'short', ageToken: gate.body.ageToken })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// dobForAge subtracts a day, so on Jan 1 the birth year rolls back one more.
function isJan1() {
  const d = new Date();
  return d.getUTCMonth() === 0 && d.getUTCDate() === 1;
}
