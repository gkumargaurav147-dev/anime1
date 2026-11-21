import type { Message } from '@anime/shared-types';
import { createTestApp, resetDb, type TestCtx } from './helpers';
import { makeFriends, makeUser, newClientId, sendText, type TestUser } from './social-helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

let a: TestUser;
let b: TestUser;
let conv: string;
beforeEach(async () => {
  a = await makeUser(ctx);
  b = await makeUser(ctx);
  conv = await makeFriends(ctx, a, b);
});

const page = (u: TestUser, query: string) =>
  ctx
    .http()
    .get(`/conversations/${conv}/messages${query}`)
    .set('authorization', u.bearer)
    .expect(200);

describe('sending', () => {
  it('stores a message with seq, status sent and null anime_scene', async () => {
    const res = await sendText(ctx, a, conv, 'hello').expect(201);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.message).toMatchObject({
      conversationId: conv,
      senderId: a.id,
      text: 'hello',
      seq: 1,
      status: 'sent',
      animeScene: null,
    });
  });

  it('is idempotent: retrying with the same clientMessageId never duplicates', async () => {
    const id = newClientId();
    const first = await sendText(ctx, a, conv, 'once', id).expect(201);
    const retries = await Promise.all(
      Array.from({ length: 5 }, () => sendText(ctx, a, conv, 'once', id)),
    );
    for (const r of retries) {
      expect([200, 201]).toContain(r.status);
      expect(r.body.message.id).toBe(first.body.message.id);
    }
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM messages');
    expect(rows[0].n).toBe(1);
    // And no seq numbers were burned by the retries.
    expect((await sendText(ctx, a, conv, 'next').expect(201)).body.message.seq).toBe(2);
  });

  it('handles concurrent first attempts with the same id', async () => {
    const id = newClientId();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => sendText(ctx, a, conv, 'race', id)),
    );
    expect(new Set(results.map((r) => r.body.message.id)).size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it('allocates strictly increasing seq numbers under concurrency', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => sendText(ctx, i % 2 ? a : b, conv, `m${i}`).expect(201)),
    );
    const { rows } = await ctx.pool.query('SELECT seq FROM messages ORDER BY seq');
    expect(rows.map((r) => Number(r.seq))).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('rejects empty, oversized and bad client ids', async () => {
    await sendText(ctx, a, conv, '   ').expect(400);
    await sendText(ctx, a, conv, 'x'.repeat(4001)).expect(400);
    await sendText(ctx, a, conv, 'ok', 'bad id!').expect(400);
  });

  it('non-members cannot read or write', async () => {
    const c = await makeUser(ctx);
    await sendText(ctx, c, conv, 'intruder').expect(404);
    await ctx
      .http()
      .get(`/conversations/${conv}/messages`)
      .set('authorization', c.bearer)
      .expect(404);
  });
});

describe('history', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 7; i++) await sendText(ctx, i % 2 ? a : b, conv, `m${i}`).expect(201);
  });

  const seqs = (ms: Message[]) => ms.map((m) => m.seq);

  it('pages backwards with a cursor', async () => {
    const p1 = await page(b, '?limit=3');
    expect(seqs(p1.body.messages)).toEqual([7, 6, 5]);
    expect(p1.body.nextCursor).toBe(5);
    const p2 = await page(b, `?limit=3&before=${p1.body.nextCursor}`);
    expect(seqs(p2.body.messages)).toEqual([4, 3, 2]);
    const p3 = await page(b, `?limit=3&before=${p2.body.nextCursor}`);
    expect(seqs(p3.body.messages)).toEqual([1]);
    expect(p3.body.nextCursor).toBeNull();
  });

  it('syncs forward after a reconnect', async () => {
    const p1 = await page(b, '?after=4&limit=2');
    expect(seqs(p1.body.messages)).toEqual([5, 6]);
    const p2 = await page(b, `?after=${p1.body.nextCursor}&limit=2`);
    expect(seqs(p2.body.messages)).toEqual([7]);
    expect(p2.body.nextCursor).toBeNull();
    expect((await page(b, '?after=7')).body.messages).toEqual([]);
  });

  it('messages are permanent: there is no delete route', async () => {
    const [m] = (await page(a, '?limit=1')).body.messages;
    await ctx
      .http()
      .delete(`/conversations/${conv}/messages/${m.id}`)
      .set('authorization', a.bearer)
      .expect(404);
    expect((await page(a, '')).body.messages).toHaveLength(7);
  });
});

describe('delivery states', () => {
  it('moves sent -> delivered -> seen and never back', async () => {
    const m1 = (await sendText(ctx, a, conv, 'one').expect(201)).body.message;
    const m2 = (await sendText(ctx, a, conv, 'two').expect(201)).body.message;

    const post = (kind: string, upToSeq: number, u = b) =>
      ctx
        .http()
        .post(`/conversations/${conv}/${kind}`)
        .set('authorization', u.bearer)
        .send({ upToSeq })
        .expect(200);

    await post('delivered', m2.seq);
    let msgs = (await page(a, '')).body.messages as Message[];
    expect(msgs.map((m) => m.status)).toEqual(['delivered', 'delivered']);

    await post('seen', m1.seq);
    msgs = (await page(a, '')).body.messages;
    expect(msgs.find((m) => m.seq === m1.seq)!.status).toBe('seen');
    expect(msgs.find((m) => m.seq === m2.seq)!.status).toBe('delivered');

    // Lower pointers are ignored.
    const back = await post('delivered', 0);
    expect(back.body).toEqual({ advanced: false, upToSeq: m2.seq });
    msgs = (await page(a, '')).body.messages;
    expect(msgs.find((m) => m.seq === m1.seq)!.status).toBe('seen');

    // Pointers can't run past the last message.
    expect((await post('seen', 999)).body.upToSeq).toBe(m2.seq);

    const summary = (
      await ctx.http().get('/conversations').set('authorization', a.bearer).expect(200)
    ).body.conversations[0];
    expect(summary).toMatchObject({ peerDeliveredUpTo: 2, peerSeenUpTo: 2, lastSeq: 2 });
  });

  it("receipts only change the other person's messages", async () => {
    const mine = (await sendText(ctx, b, conv, 'from b').expect(201)).body.message;
    await ctx
      .http()
      .post(`/conversations/${conv}/seen`)
      .set('authorization', b.bearer)
      .send({ upToSeq: mine.seq })
      .expect(200);
    expect((await page(a, '')).body.messages[0].status).toBe('sent');
  });

  it('counts unread messages per conversation', async () => {
    await sendText(ctx, a, conv, '1').expect(201);
    await sendText(ctx, a, conv, '2').expect(201);
    await sendText(ctx, b, conv, 'reply').expect(201);
    const list = (await ctx.http().get('/conversations').set('authorization', b.bearer).expect(200))
      .body;
    expect(list.conversations[0]).toMatchObject({
      unreadCount: 2,
      peer: { id: a.id, username: a.username },
      canSend: true,
      lastMessage: { text: 'reply' },
    });
  });
});
