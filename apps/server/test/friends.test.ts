import { createTestApp, resetDb, type TestCtx } from './helpers';
import { makeFriends, makeUser, sendText } from './social-helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

const get = (path: string, bearer: string) =>
  ctx.http().get(path).set('authorization', bearer).expect(200);

describe('friend requests', () => {
  it('needs both sides: request is pending until the other user accepts', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);

    const req = await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username.toUpperCase() })
      .expect(201);
    expect(req.body).toEqual({ status: 'pending', user: { id: b.id, username: b.username } });

    expect((await get('/friends', a.bearer)).body.friends).toEqual([]);
    expect((await get('/friends/requests', a.bearer)).body.requests).toMatchObject([
      { direction: 'outgoing', user: { id: b.id } },
    ]);
    expect((await get('/friends/requests', b.bearer)).body.requests).toMatchObject([
      { direction: 'incoming', user: { id: a.id } },
    ]);

    // The requester cannot accept their own request.
    await ctx
      .http()
      .post(`/friends/requests/${b.id}/accept`)
      .set('authorization', a.bearer)
      .expect(404);

    await ctx
      .http()
      .post(`/friends/requests/${a.id}/accept`)
      .set('authorization', b.bearer)
      .expect(204);
    const friends = (await get('/friends', a.bearer)).body.friends;
    expect(friends).toMatchObject([
      { id: b.id, username: b.username, conversationId: expect.any(String) },
    ]);
    expect((await get('/friends', b.bearer)).body.friends[0].conversationId).toBe(
      friends[0].conversationId,
    );
  });

  it('a request in the other direction accepts the pending one', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username })
      .expect(201);
    const res = await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', b.bearer)
      .send({ username: a.username })
      .expect(200);
    expect(res.body.status).toBe('accepted');
  });

  it('repeating a request is idempotent and re-requesting a friend is refused', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username })
      .expect(201);
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username })
      .expect(200);
    await ctx
      .http()
      .post(`/friends/requests/${a.id}/accept`)
      .set('authorization', b.bearer)
      .expect(204);
    const again = await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username })
      .expect(409);
    expect(again.body.error.code).toBe('ALREADY_FRIENDS');
  });

  it('decline and cancel remove the pending request', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username })
      .expect(201);
    await ctx.http().delete(`/friends/requests/${a.id}`).set('authorization', b.bearer).expect(204);
    expect((await get('/friends/requests', a.bearer)).body.requests).toEqual([]);

    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username })
      .expect(201);
    await ctx.http().delete(`/friends/requests/${b.id}`).set('authorization', a.bearer).expect(204);
    expect((await get('/friends/requests', b.bearer)).body.requests).toEqual([]);
  });

  it('rejects unknown users and yourself with the same 404', async () => {
    const a = await makeUser(ctx);
    const unknown = await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: 'nobody_here' })
      .expect(404);
    const self = await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: a.username })
      .expect(404);
    expect(unknown.body).toEqual(self.body);
  });

  it('requires authentication', async () => {
    await ctx.http().get('/friends').expect(401);
    await ctx.http().post('/friends/requests').send({ username: 'x_user' }).expect(401);
  });
});

describe('QR codes', () => {
  it('sends a request to the QR owner', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    const { qrToken, expiresInSeconds } = (await get('/friends/qr', b.bearer)).body;
    expect(expiresInSeconds).toBe(600);
    const res = await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ qrToken })
      .expect(201);
    expect(res.body.user.id).toBe(b.id);
  });

  it('rejects tampered or other-purpose tokens', async () => {
    const a = await makeUser(ctx);
    const res = await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ qrToken: a.token }) // an access token is not a QR token
      .expect(400);
    expect(res.body.error.code).toBe('QR_INVALID');
  });

  it('scanning your own QR does nothing', async () => {
    const a = await makeUser(ctx);
    const { qrToken } = (await get('/friends/qr', a.bearer)).body;
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ qrToken })
      .expect(404);
  });
});

describe('teens', () => {
  it('can add by exact username or QR, and there is no fuzzy lookup', async () => {
    const teen = await makeUser(ctx, { age: 15, username: 'teen_user' });
    const adult = await makeUser(ctx, { username: 'adult_user' });

    await ctx
      .http()
      .get('/users/by-username/adult_user')
      .set('authorization', teen.bearer)
      .expect(200);
    // Prefixes / partial matches find nothing.
    await ctx.http().get('/users/by-username/adult').set('authorization', teen.bearer).expect(404);
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', teen.bearer)
      .send({ username: 'adult' })
      .expect(404);

    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', teen.bearer)
      .send({ username: 'adult_user' })
      .expect(201);
    const { qrToken } = (await get('/friends/qr', adult.bearer)).body;
    const other = await makeUser(ctx, { age: 14 });
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', other.bearer)
      .send({ qrToken })
      .expect(201);
  });

  it('lookups never expose age or other private fields', async () => {
    const teen = await makeUser(ctx, { age: 15 });
    const adult = await makeUser(ctx);
    const res = await ctx
      .http()
      .get(`/users/by-username/${teen.username}`)
      .set('authorization', adult.bearer)
      .expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['id', 'username']);
  });
});

describe('remove and block', () => {
  it('removing a friend keeps history but stops sending', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    const conv = await makeFriends(ctx, a, b);
    await sendText(ctx, a, conv, 'hello').expect(201);

    await ctx.http().delete(`/friends/${b.id}`).set('authorization', a.bearer).expect(204);
    expect((await get('/friends', b.bearer)).body.friends).toEqual([]);

    const history = await get(`/conversations/${conv}/messages`, b.bearer);
    expect(history.body.messages.map((m: { text: string }) => m.text)).toEqual(['hello']);
    const refused = await sendText(ctx, b, conv, 'still there?').expect(403);
    expect(refused.body.error.code).toBe('NOT_FRIENDS');
    const convs = (await get('/conversations', a.bearer)).body.conversations;
    expect(convs[0].canSend).toBe(false);
  });

  it('blocking ends the friendship, hides the user, and prevents new requests', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    const conv = await makeFriends(ctx, a, b);

    await ctx
      .http()
      .post('/blocks')
      .set('authorization', a.bearer)
      .send({ userId: b.id })
      .expect(204);
    expect((await get('/blocks', a.bearer)).body.blocked).toEqual([
      { id: b.id, username: b.username },
    ]);
    expect((await get('/friends', a.bearer)).body.friends).toEqual([]);
    expect((await get('/friends', b.bearer)).body.friends).toEqual([]);

    // Blocked user can't find or request the blocker (looks like "not found").
    await ctx
      .http()
      .get(`/users/by-username/${a.username}`)
      .set('authorization', b.bearer)
      .expect(404);
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', b.bearer)
      .send({ username: a.username })
      .expect(404);
    // Nor message them.
    await sendText(ctx, b, conv, 'hi').expect(403);
    // The blocker can't request them either, until they unblock.
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username })
      .expect(404);

    await ctx.http().delete(`/blocks/${b.id}`).set('authorization', a.bearer).expect(204);
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username })
      .expect(201);
  });

  it('blocking removes a pending request and a blocked user cannot accept', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username })
      .expect(201);
    await ctx
      .http()
      .post('/blocks')
      .set('authorization', b.bearer)
      .send({ userId: a.id })
      .expect(204);
    await ctx
      .http()
      .post(`/friends/requests/${a.id}/accept`)
      .set('authorization', b.bearer)
      .expect(404);
    expect((await get('/friends/requests', a.bearer)).body.requests).toEqual([]);
  });
});
