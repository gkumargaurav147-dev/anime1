import { createTestApp, resetDb, type TestCtx } from './helpers';
import { MemoryPresenceStore } from '../src/realtime/presence';
import { TestSocket, makeFriends, makeUser, newClientId, sendText } from './social-helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp({ HEARTBEAT_INTERVAL_MS: 200, WS_AUTH_TIMEOUT_MS: 300 });
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

const sockets: TestSocket[] = [];
afterEach(() => {
  for (const s of sockets.splice(0)) s.close();
});
const connect = async (u: Parameters<typeof TestSocket.connect>[1]) => {
  const s = await TestSocket.connect(ctx, u);
  sockets.push(s);
  return s;
};

describe('WebSocket auth', () => {
  it('accepts a valid access token', async () => {
    const a = await makeUser(ctx);
    const s = await TestSocket.open(ctx.wsUrl);
    sockets.push(s);
    s.send({ type: 'auth', token: a.token });
    const ready = await s.next((f) => f.type === 'ready');
    expect(ready).toMatchObject({ userId: a.id, heartbeatIntervalMs: 200 });
    s.send({ type: 'ping' });
    await s.next((f) => f.type === 'pong');
  });

  it('closes with 4401 for a bad token', async () => {
    const s = await TestSocket.open(ctx.wsUrl);
    s.send({ type: 'auth', token: 'nope' });
    expect(await s.waitForClose()).toBe(4401);
  });

  it('closes with 4401 when the first frame is not auth', async () => {
    const s = await TestSocket.open(ctx.wsUrl);
    s.send({ type: 'ping' });
    expect(await s.waitForClose()).toBe(4401);
  });

  it('closes with 4408 when no auth frame arrives in time', async () => {
    const s = await TestSocket.open(ctx.wsUrl);
    expect(await s.waitForClose()).toBe(4408);
  });

  it('closes open sockets once the session is logged out', async () => {
    const a = await makeUser(ctx);
    const s = await connect(a);
    await ctx.http().post('/auth/logout').set('authorization', a.bearer).expect(204);
    expect(await s.waitForClose()).toBe(4401);
  });
});

describe('realtime messaging', () => {
  it('delivers messages to the recipient and echoes to the sender', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    const conv = await makeFriends(ctx, a, b);
    const sa = await connect(a);
    const sb = await connect(b);

    const clientMessageId = newClientId();
    sa.send({ type: 'send', conversationId: conv, clientMessageId, text: 'hey b' });

    const ack = await sa.next<'ack'>((f) => f.type === 'ack');
    expect(ack).toMatchObject({
      clientMessageId,
      duplicate: false,
      message: { text: 'hey b', seq: 1 },
    });
    const incoming = await sb.next<'message'>((f) => f.type === 'message');
    expect(incoming.message).toMatchObject({ id: ack.message.id, senderId: a.id, text: 'hey b' });
    // Sender's own devices get the message event too.
    await sa.next((f) => f.type === 'message');
  });

  it('a retried send over the socket is acked as a duplicate and not re-broadcast', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    const conv = await makeFriends(ctx, a, b);
    const sa = await connect(a);
    const sb = await connect(b);

    const clientMessageId = newClientId();
    sa.send({ type: 'send', conversationId: conv, clientMessageId, text: 'once' });
    await sa.next((f) => f.type === 'ack');
    sa.send({ type: 'send', conversationId: conv, clientMessageId, text: 'once' });
    const dup = await sa.next<'ack'>((f) => f.type === 'ack');
    expect(dup.duplicate).toBe(true);

    await sb.next((f) => f.type === 'message');
    await new Promise((r) => setTimeout(r, 150));
    expect(sb.frames.filter((f) => f.type === 'message')).toHaveLength(0);
  });

  it('keeps messages from one socket in send order', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    const conv = await makeFriends(ctx, a, b);
    const sa = await connect(a);
    for (let i = 0; i < 10; i++) {
      sa.send({
        type: 'send',
        conversationId: conv,
        clientMessageId: newClientId(),
        text: `n${i}`,
      });
    }
    for (let i = 0; i < 10; i++) {
      const ack = await sa.next<'ack'>((f) => f.type === 'ack');
      expect(ack.message).toMatchObject({ text: `n${i}`, seq: i + 1 });
    }
  });

  it('reports errors for sends that are not allowed', async () => {
    const a = await makeUser(ctx);
    const c = await makeUser(ctx);
    const b = await makeUser(ctx);
    const conv = await makeFriends(ctx, a, b);
    const sc = await connect(c);
    const clientMessageId = newClientId();
    sc.send({ type: 'send', conversationId: conv, clientMessageId, text: 'let me in' });
    const err = await sc.next<'error'>((f) => f.type === 'error');
    expect(err).toMatchObject({ code: 'NOT_FOUND', clientMessageId });
  });

  it('pushes delivered and seen receipts to the sender', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    const conv = await makeFriends(ctx, a, b);
    const sa = await connect(a);
    const sb = await connect(b);

    const m = (await sendText(ctx, a, conv, 'tick tick').expect(201)).body.message;
    await sb.next((f) => f.type === 'message');

    sb.send({ type: 'delivered', conversationId: conv, upToSeq: m.seq });
    expect(await sa.next((f) => f.type === 'receipt')).toEqual({
      type: 'receipt',
      conversationId: conv,
      userId: b.id,
      status: 'delivered',
      upToSeq: m.seq,
    });
    sb.send({ type: 'seen', conversationId: conv, upToSeq: m.seq });
    expect(await sa.next((f) => f.type === 'receipt')).toMatchObject({
      status: 'seen',
      upToSeq: m.seq,
    });
  });

  it('notifies both users when friendships change', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    const sb = await connect(b);
    await ctx
      .http()
      .post('/friends/requests')
      .set('authorization', a.bearer)
      .send({ username: b.username })
      .expect(201);
    await sb.next((f) => f.type === 'friends.changed');
  });
});

describe('heartbeat and presence', () => {
  it('terminates sockets that stop answering pings', async () => {
    const a = await makeUser(ctx);
    const s = await TestSocket.open(ctx.wsUrl, { autoPong: false });
    sockets.push(s);
    s.send({ type: 'auth', token: a.token });
    await s.next((f) => f.type === 'ready');
    // Server terminates the TCP connection without a close frame.
    expect(await s.waitForClose(2000)).toBe(1006);
  });

  it('tells friends when you come online and go offline', async () => {
    const a = await makeUser(ctx);
    const b = await makeUser(ctx);
    await makeFriends(ctx, a, b);
    const sa = await connect(a);

    const sb = await TestSocket.connect(ctx, b);
    expect(await sa.next((f) => f.type === 'presence')).toMatchObject({
      userId: b.id,
      online: true,
    });

    const both = await ctx
      .http()
      .get(`/presence?userIds=${b.id}`)
      .set('authorization', a.bearer)
      .expect(200);
    expect(both.body.presence).toMatchObject([{ userId: b.id, online: true }]);

    sb.close();
    const off = await sa.next<'presence'>((f) => f.type === 'presence');
    expect(off).toMatchObject({ userId: b.id, online: false, lastSeenAt: expect.any(String) });
  });

  it('only reveals presence of friends', async () => {
    const a = await makeUser(ctx);
    const stranger = await makeUser(ctx);
    await connect(stranger);
    const res = await ctx
      .http()
      .get(`/presence?userIds=${stranger.id}`)
      .set('authorization', a.bearer)
      .expect(200);
    expect(res.body.presence).toEqual([]);
  });
});

describe('MemoryPresenceStore TTL', () => {
  it('expires users who stop heartbeating', async () => {
    let now = 1_000_000;
    const store = new MemoryPresenceStore(60, () => now);
    expect(await store.touch('u1')).toBe(true);
    expect(await store.touch('u1')).toBe(false);
    now += 59_000;
    expect((await store.get(['u1']))[0]!.online).toBe(true);
    now += 2_000;
    expect((await store.get(['u1']))[0]).toMatchObject({
      online: false,
      lastSeenAt: expect.any(String),
    });
    expect(await store.touch('u1')).toBe(true);
  });
});
