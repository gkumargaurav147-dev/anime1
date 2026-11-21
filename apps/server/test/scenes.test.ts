import { sceneFromCatalog, suggestScene, type Scene } from '@anime/scene-engine';
import { createTestApp, resetDb, type TestCtx } from './helpers';
import { TestSocket, makeFriends, makeUser, newClientId, type TestUser } from './social-helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

const send = (u: TestUser, conv: string, body: Record<string, unknown>) =>
  ctx
    .http()
    .post(`/conversations/${conv}/messages`)
    .set('authorization', u.bearer)
    .send({ clientMessageId: newClientId(), ...body });

const dinner = () => suggestScene('Can we go out for dinner tonight?', { age: 25 }).scene!;

describe('message payload: anime_scene', () => {
  let a: TestUser;
  let b: TestUser;
  let conv: string;
  beforeEach(async () => {
    a = await makeUser(ctx);
    b = await makeUser(ctx);
    conv = await makeFriends(ctx, a, b);
  });

  it('stores a valid scene with the text, and both sides see it', async () => {
    const res = await send(a, conv, {
      text: 'Can we go out for dinner tonight?',
      animeScene: dinner(),
    }).expect(201);
    expect(res.body.sceneDropped).toBeNull();
    const scene = res.body.message.animeScene as Scene;
    expect(scene.catalog_scene_id).toBe('dinner_out');
    expect(scene.speech_bubble?.text).toBe('Dinner tonight?');

    const page = await ctx
      .http()
      .get(`/conversations/${conv}/messages`)
      .set('authorization', b.bearer)
      .expect(200);
    expect(page.body.messages[0]).toMatchObject({
      text: 'Can we go out for dinner tonight?',
      animeScene: { catalog_scene_id: 'dinner_out' },
    });
  });

  it('text-only messages have animeScene null', async () => {
    const res = await send(a, conv, { text: 'just text' }).expect(201);
    expect(res.body.message.animeScene).toBeNull();
    expect(res.body.sceneDropped).toBeNull();
  });

  it.each([
    ['not an object', 'banana'],
    ['wrong shape', { hello: 'world' }],
    ['bad enum', { ...dinner(), emotion: 'smug' }],
    ['unknown catalog id', { ...dinner(), catalog_scene_id: 'made_up_scene' }],
    ['no catalog id', { ...dinner(), catalog_scene_id: null }],
    [
      'too many characters',
      { ...dinner(), characters: [...dinner().characters, ...dinner().characters] },
    ],
  ])('drops an invalid scene (%s) but keeps and delivers the text', async (_name, animeScene) => {
    const res = await send(a, conv, { text: 'still arrives', animeScene }).expect(201);
    expect(res.body.message.text).toBe('still arrives');
    expect(res.body.message.animeScene).toBeNull();
    expect(res.body.sceneDropped).toBe('invalid');
  });

  it('drops an oversized scene', async () => {
    const big = { ...dinner(), padding: 'x'.repeat(10_000) };
    const res = await send(a, conv, { text: 'big', animeScene: big }).expect(201);
    expect(res.body.sceneDropped).toBe('too_large');
    expect(res.body.message.animeScene).toBeNull();
  });

  it('rewrites character avatar ids to the sender and the other member', async () => {
    const scene = dinner();
    scene.characters = scene.characters.map((c) => ({ ...c, avatar_id: 'someone_else' }));
    const res = await send(a, conv, { text: 'hi', animeScene: scene }).expect(201);
    const stored = res.body.message.animeScene as Scene;
    expect(stored.characters.map((c) => c.avatar_id)).toEqual([a.id, b.id]);
  });

  it('accepts a scene over the WebSocket too', async () => {
    const s = await TestSocket.connect(ctx, a);
    const clientMessageId = newClientId();
    s.send({
      type: 'send',
      conversationId: conv,
      clientMessageId,
      text: 'ws',
      animeScene: dinner(),
    });
    const ack = await s.next<'ack'>((f) => f.type === 'ack');
    expect((ack.message.animeScene as Scene).catalog_scene_id).toBe('dinner_out');
    s.close();
  });
});

describe('age-restricted scenes', () => {
  it('never delivers an 18+ scene into a chat with a teen (text still sent)', async () => {
    const adult = await makeUser(ctx, { age: 30 });
    const teen = await makeUser(ctx, { age: 15 });
    const conv = await makeFriends(ctx, adult, teen);
    const romantic = sceneFromCatalog('date_night', { age: 30, bubbleText: 'Date night?' })!;
    const res = await send(adult, conv, { text: 'movie?', animeScene: romantic }).expect(201);
    expect(res.body.message.animeScene).toBeNull();
    expect(res.body.sceneDropped).toBe('age_restricted');
  });

  it('allows it between adults', async () => {
    const x = await makeUser(ctx, { age: 30 });
    const y = await makeUser(ctx, { age: 28 });
    const conv = await makeFriends(ctx, x, y);
    const romantic = sceneFromCatalog('date_night', { age: 30, bubbleText: 'Date night?' })!;
    const res = await send(x, conv, { text: 'date?', animeScene: romantic }).expect(201);
    expect(res.body.sceneDropped).toBeNull();
  });
});
