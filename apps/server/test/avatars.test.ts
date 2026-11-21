import { randomAvatar } from '@anime/scene-engine';
import { createTestApp, resetDb, type TestCtx } from './helpers';
import { TestSocket, makeFriends, makeUser } from './social-helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

describe('avatars', () => {
  it('allows PUT and DELETE in the CORS preflight (web build)', async () => {
    for (const method of ['PUT', 'DELETE']) {
      const res = await ctx
        .http()
        .options('/me/avatar')
        .set('origin', 'http://localhost:8081')
        .set('access-control-request-method', method)
        .expect(204);
      expect(res.headers['access-control-allow-methods']).toContain(method);
    }
  });

  it('starts empty, saves, and reads back exactly', async () => {
    const a = await makeUser(ctx);
    const empty = await ctx.http().get('/me/avatar').set('authorization', a.bearer).expect(200);
    expect(empty.body).toMatchObject({ userId: a.id, avatar: null });

    const avatar = randomAvatar('alice');
    const saved = await ctx
      .http()
      .put('/me/avatar')
      .set('authorization', a.bearer)
      .send({ avatar })
      .expect(200);
    expect(saved.body.avatar).toEqual(avatar);
    const read = await ctx.http().get('/me/avatar').set('authorization', a.bearer).expect(200);
    expect(read.body.avatar).toEqual(avatar);

    const next = { ...avatar, hairColor: 'pink' };
    await ctx
      .http()
      .put('/me/avatar')
      .set('authorization', a.bearer)
      .send({ avatar: next })
      .expect(200);
    expect(
      (await ctx.http().get('/me/avatar').set('authorization', a.bearer)).body.avatar.hairColor,
    ).toBe('pink');
  });

  it('rejects unknown options and extra fields', async () => {
    const a = await makeUser(ctx);
    const avatar = randomAvatar('x');
    await ctx
      .http()
      .put('/me/avatar')
      .set('authorization', a.bearer)
      .send({ avatar: { ...avatar, hairStyle: 'mohawk' } })
      .expect(400);
    await ctx
      .http()
      .put('/me/avatar')
      .set('authorization', a.bearer)
      .send({ avatar: { ...avatar, photo: 'data:...' } })
      .expect(400);
  });

  it('friends can see it; strangers and blocked users cannot', async () => {
    const a = await makeUser(ctx);
    const friend = await makeUser(ctx);
    const stranger = await makeUser(ctx);
    await makeFriends(ctx, a, friend);
    const avatar = randomAvatar('a');
    await ctx.http().put('/me/avatar').set('authorization', a.bearer).send({ avatar }).expect(200);

    const byFriend = await ctx
      .http()
      .get(`/users/${a.id}/avatar`)
      .set('authorization', friend.bearer)
      .expect(200);
    expect(byFriend.body.avatar).toEqual(avatar);
    await ctx.http().get(`/users/${a.id}/avatar`).set('authorization', stranger.bearer).expect(404);

    const batch = await ctx
      .http()
      .get(`/avatars?userIds=${a.id},${stranger.id}`)
      .set('authorization', friend.bearer)
      .expect(200);
    expect(batch.body.avatars.map((x: { userId: string }) => x.userId)).toEqual([a.id]);

    await ctx
      .http()
      .post('/blocks')
      .set('authorization', a.bearer)
      .send({ userId: friend.id })
      .expect(204);
    await ctx.http().get(`/users/${a.id}/avatar`).set('authorization', friend.bearer).expect(404);
  });

  it('tells friends when it changes', async () => {
    const a = await makeUser(ctx);
    const friend = await makeUser(ctx);
    await makeFriends(ctx, a, friend);
    const s = await TestSocket.connect(ctx, friend);
    await ctx
      .http()
      .put('/me/avatar')
      .set('authorization', a.bearer)
      .send({ avatar: randomAvatar('z') })
      .expect(200);
    expect(await s.next((f) => f.type === 'avatar.changed')).toEqual({
      type: 'avatar.changed',
      userId: a.id,
    });
    s.close();
  });

  it('is deleted with the account', async () => {
    const a = await makeUser(ctx);
    await ctx
      .http()
      .put('/me/avatar')
      .set('authorization', a.bearer)
      .send({ avatar: randomAvatar('q') })
      .expect(200);
    await ctx
      .http()
      .delete('/me')
      .set('authorization', a.bearer)
      .send({ password: a.password })
      .expect(204);
    const { rows } = await ctx.pool.query(
      'SELECT count(*)::int AS n FROM avatars WHERE user_id = $1',
      [a.id],
    );
    expect(rows[0].n).toBe(0);
  });
});
