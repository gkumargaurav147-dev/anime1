import {
  AVATAR_OPTIONS,
  AVATAR_PARTS,
  AvatarConfigSchema,
  AvatarDirectory,
  BLENDSHAPES,
  EMOTIONS,
  EMOTION_TO_EXPRESSION,
  EXPRESSION_DEFS,
  EXPRESSIONS,
  FrameRateGovernor,
  GESTURES,
  LevelASvgRenderer,
  MOOD_TO_EXPRESSION,
  PlaceholderAssetProvider,
  SCENE_EXPRESSION_TO_ID,
  SKIN_PALETTE,
  HAIR_PALETTE,
  avatarFrame,
  blinkAt,
  chooseRendererLevel,
  composeScene,
  getExpression,
  idleMotion,
  randomAvatar,
  renderSvg,
  sceneFromCatalog,
  scaledWeights,
  suggestScene,
  type AvatarConfig,
  type Scene,
} from '../src';

const renderer = new LevelASvgRenderer();

describe('avatar data model', () => {
  it('has at least 6 options for every part', () => {
    for (const part of AVATAR_PARTS) expect(AVATAR_OPTIONS[part].length).toBeGreaterThanOrEqual(6);
  });

  it('randomAvatar is reproducible and valid', () => {
    expect(randomAvatar('seed-1')).toEqual(randomAvatar('seed-1'));
    expect(randomAvatar('seed-1')).not.toEqual(randomAvatar('seed-2'));
    for (let i = 0; i < 50; i++)
      expect(AvatarConfigSchema.safeParse(randomAvatar(i)).success).toBe(true);
  });

  it('rejects unknown options and extra fields (no free-form data)', () => {
    const ok = randomAvatar('x');
    expect(AvatarConfigSchema.safeParse({ ...ok, hairStyle: 'mohawk' }).success).toBe(false);
    expect(AvatarConfigSchema.safeParse({ ...ok, photoUrl: 'http://x' }).success).toBe(false);
  });
});

describe('expression system', () => {
  it('defines 100+ expressions using only canonical blendshape names, weights 0..1', () => {
    expect(EXPRESSION_DEFS.length).toBeGreaterThanOrEqual(100);
    const names = new Set(BLENDSHAPES);
    for (const e of EXPRESSION_DEFS) {
      for (const [k, v] of Object.entries(e.weights)) {
        expect(names.has(k)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('maps every scene emotion, scene expression and brief mood to a real expression', () => {
    const ids = new Set(EXPRESSION_DEFS.map((e) => e.id));
    for (const em of EMOTIONS) expect(ids.has(EMOTION_TO_EXPRESSION[em])).toBe(true);
    for (const ex of EXPRESSIONS) expect(ids.has(SCENE_EXPRESSION_TO_ID[ex])).toBe(true);
    for (const id of Object.values(MOOD_TO_EXPRESSION)) expect(ids.has(id)).toBe(true);
    for (const m of [
      'smile',
      'grin',
      'wink',
      'squint',
      'scrunch',
      'laugh',
      'cry',
      'angry',
      'shy',
      'shocked',
      'sleepy',
      'worried',
      'confused',
      'smirk',
    ]) {
      expect(MOOD_TO_EXPRESSION[m]).toBeDefined();
    }
  });

  it('intensity 1–3 scales weights', () => {
    const e = getExpression('laugh');
    const w1 = scaledWeights(e, 1).jawOpen!;
    const w2 = scaledWeights(e, 2).jawOpen!;
    const w3 = scaledWeights(e, 3).jawOpen!;
    expect(w1).toBeLessThan(w2);
    expect(w2).toBeLessThan(w3);
  });

  it('has the required gestures and every suggested gesture exists', () => {
    const ids = new Set(GESTURES.map((g) => g.id));
    for (const g of ['thumbs_up', 'wave', 'heart_hands', 'facepalm', 'bow'])
      expect(ids.has(g)).toBe(true);
    for (const e of EXPRESSION_DEFS) if (e.gesture) expect(ids.has(e.gesture)).toBe(true);
    for (const g of GESTURES) {
      const ts = g.keys.map((k) => k.t);
      expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    }
  });

  it('plays a gesture together with an expression', () => {
    const f = avatarFrame(
      {
        expressionId: 'laugh',
        gestureId: 'thumbs_up',
        gestureElapsedMs: 800,
        seed: 'a',
        idle: false,
      },
      0,
    );
    expect(f.weights.jawOpen).toBeGreaterThan(0.5);
    expect(f.hands.right?.shape).toBe('thumbs_up');
  });
});

describe('idle loop', () => {
  it('blinks every 3–5 seconds, at different times for different avatars', () => {
    const starts = (seed: string) => {
      const out: number[] = [];
      let prev = 0;
      for (let t = 0; t < 60_000; t += 10) {
        const b = blinkAt(t, seed);
        if (b > 0 && prev === 0) out.push(t);
        prev = b;
      }
      return out;
    };
    const a = starts('alice');
    expect(a.length).toBeGreaterThanOrEqual(11);
    for (let i = 1; i < a.length; i++) {
      const gap = a[i]! - a[i - 1]!;
      expect(gap).toBeGreaterThanOrEqual(3000);
      expect(gap).toBeLessThanOrEqual(5200);
    }
    expect(starts('bob')).not.toEqual(a);
  });

  it('breathes and sways subtly', () => {
    for (let t = 0; t < 10_000; t += 250) {
      const m = idleMotion(t, 'x');
      expect(m.breath).toBeGreaterThanOrEqual(0);
      expect(m.breath).toBeLessThanOrEqual(1);
      expect(Math.abs(m.head.yaw)).toBeLessThanOrEqual(2.5);
    }
  });
});

describe('Level A renderer', () => {
  const people = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i}`,
    config: randomAvatar(`p${i}`),
  }));

  it('is deterministic: same input, identical SVG', () => {
    const req = {
      config: people[0]!.config,
      avatarId: 'p0',
      expressionId: 'wink',
      gestureId: 'wave',
      gestureElapsedMs: 300,
    };
    expect(renderer.renderDocument(req, 1234)).toBe(renderer.renderDocument(req, 1234));
  });

  it('renders every expression and gesture without NaN/undefined', () => {
    for (const p of people.slice(0, 3)) {
      for (const e of EXPRESSION_DEFS) {
        const svg = renderer.renderDocument({
          config: p.config,
          avatarId: p.id,
          expressionId: e.id,
        });
        expect(svg).not.toMatch(/undefined|NaN/);
      }
      for (const g of GESTURES) {
        for (const t of [0, g.duration_ms / 2, g.duration_ms]) {
          const svg = renderer.renderDocument({
            config: p.config,
            avatarId: p.id,
            expressionId: 'smile',
            gestureId: g.id,
            gestureElapsedMs: t,
          });
          expect(svg).not.toMatch(/undefined|NaN/);
        }
      }
    }
  });

  it('renders every option of every part', () => {
    const base = randomAvatar('base');
    for (const part of AVATAR_PARTS) {
      for (const value of AVATAR_OPTIONS[part]) {
        const config = { ...base, [part]: value } as AvatarConfig;
        const svg = renderer.renderDocument({ config, avatarId: 'x', expressionId: 'smile' });
        expect(svg).not.toMatch(/undefined|NaN/);
      }
    }
  });
});

describe('same avatar_id looks identical everywhere', () => {
  const me: AvatarConfig = {
    version: 1,
    faceShape: 'heart',
    skinTone: 'golden',
    eyeShape: 'almond',
    eyeColor: 'green',
    eyebrows: 'arched',
    nose: 'button',
    mouth: 'full',
    hairStyle: 'long_wavy',
    hairColor: 'auburn',
    marks: 'freckles',
    facialHair: 'none',
    earrings: 'hoops',
    glasses: 'round',
    outfit: 'denim_jacket',
    collar: 'shirt_collar',
    accentColor: 'coral',
  };
  const directory = new AvatarDirectory();
  directory.set('user_42', me);
  const assets = new PlaceholderAssetProvider();

  /** Identity = the colours and parts that define the person (not the expression). */
  function identity(svg: string) {
    const grads: Record<string, string> = {};
    for (const m of svg.matchAll(
      /<radialGradient id="[^"]*?(skin|hair|cloth|iris)"[^>]*>(.*?)<\/radialGradient>/g,
    )) {
      grads[m[1]!] = m[2]!;
    }
    return {
      grads,
      freckles: (svg.match(/r="1\.4"/g) ?? []).length,
      hoops: svg.includes('stroke="#F2C14E"'),
      glasses: (svg.match(/r="17"/g) ?? []).length,
    };
  }

  const withMe = (scene: Scene): Scene => ({
    ...scene,
    characters: scene.characters.map((c, i) => (i === 0 ? { ...c, avatar_id: 'user_42' } : c)),
  });

  const scenes: [string, Scene][] = [
    ['dinner', withMe(suggestScene('Can we go out for dinner tonight?', { age: 25 }).scene!)],
    ['birthday', withMe(sceneFromCatalog('birthday_cake', { age: 25, bubbleText: 'HBD!' })!)],
    ['cancel', withMe(suggestScene('Not coming tonight', { age: 25 }).scene!)],
    ['movie', withMe(sceneFromCatalog('movie_night', { age: 25, bubbleText: 'Movie?' })!)],
    [
      'crowd',
      withMe({
        ...sceneFromCatalog('concert_crowd', { age: 25 })!,
        characters: Array.from({ length: 40 }, (_, i) => ({
          role: i ? 'crowd' : 'sender',
          avatar_id: i ? `fan${i % 5}` : 'user_42',
          expression: 'grin',
          action: 'cheer',
        })) as Scene['characters'],
      }),
    ],
  ];

  const myAsset = (scene: Scene) => {
    const composed = composeScene(scene, assets, { avatars: directory });
    const key = Object.keys(composed.assets).find((k) => k.startsWith('bust:user_42:'))!;
    const ref = composed.assets[key]!;
    return { svg: ref.format === 'svg' ? ref.svg : '', full: renderSvg(composed) };
  };

  const reference = identity(
    (
      renderer.renderStill({ config: me, avatarId: 'user_42', expressionId: 'neutral' }) as {
        svg: string;
      }
    ).svg,
  );

  it.each(scenes)('%s scene uses the same face, colours and accessories', (_name, scene) => {
    const { svg, full } = myAsset(scene);
    expect(identity(svg)).toEqual(reference);
    expect(full).not.toMatch(/undefined|NaN/);
  });

  it('profile picture and snap match the scene avatar', () => {
    const profile = renderer.renderDocument({
      config: me,
      avatarId: 'user_42',
      expressionId: 'smile',
      framing: 'circle',
    });
    const snap = renderer.renderDocument({
      config: me,
      avatarId: 'user_42',
      expressionId: 'laugh',
      framing: 'square',
    });
    expect(identity(profile)).toEqual(reference);
    expect(identity(snap)).toEqual(reference);
    expect(reference.grads.skin).toContain(SKIN_PALETTE.golden[0]);
    expect(reference.grads.hair).toContain(HAIR_PALETTE.auburn[0]);
  });

  it('matches the stored snapshot of the neutral profile avatar', () => {
    expect(
      renderer.renderDocument({
        config: me,
        avatarId: 'user_42',
        expressionId: 'neutral',
        framing: 'circle',
      }),
    ).toMatchSnapshot();
  });

  it.each(scenes)('%s scene matches its stored snapshot', (_name, scene) => {
    expect(myAsset(scene).svg).toMatchSnapshot();
  });
});

describe('renderer selection and downgrade', () => {
  const mid = { platform: 'android' as const, webgl: true, tier: 'mid' as const };

  it('uses 3D only when the flag is on and the device can', () => {
    expect(chooseRendererLevel(mid, { enable3d: false })).toBe('level_a_svg');
    expect(chooseRendererLevel(mid, { enable3d: true })).toBe('level_b_3d');
    expect(chooseRendererLevel({ ...mid, webgl: false }, { enable3d: true })).toBe('level_a_svg');
    expect(chooseRendererLevel({ ...mid, tier: 'low' }, { enable3d: true })).toBe(
      'fallback_static',
    );
  });

  it('respects a previous downgrade or crash on this device', () => {
    expect(chooseRendererLevel(mid, { enable3d: true, downgradedTo: 'level_a_svg' })).toBe(
      'level_a_svg',
    );
    expect(
      chooseRendererLevel(mid, { enable3d: true, failed: ['level_b_3d', 'level_a_svg'] }),
    ).toBe('fallback_static');
  });

  it('trips once after two slow 2 s windows (after warm-up), not on one hiccup', () => {
    const g = new FrameRateGovernor();
    let t = 0;
    let tripped = 0;
    const run = (fps: number, ms: number) => {
      const end = t + ms;
      for (; t < end; t += 1000 / fps) if (g.tick(t)) tripped++;
    };
    run(30, 2100); // warm-up
    run(18, 2100); // one slow window
    run(30, 2100); // recovers
    expect(tripped).toBe(0);
    run(18, 4300); // two slow windows in a row
    expect(tripped).toBe(1);
    run(10, 6000);
    expect(tripped).toBe(1);
  });

  it('does not downgrade when the app is backgrounded or the tab is hidden', () => {
    const g = new FrameRateGovernor();
    let t = 0;
    let tripped = 0;
    for (; t < 2100; t += 33) if (g.tick(t)) tripped++; // normal
    for (; t < 60_000; t += 1000) if (g.tick(t)) tripped++; // hidden: ~1 frame/s
    for (const end = t + 30_000; t < end; t += 33) if (g.tick(t)) tripped++; // back, 30 fps
    expect(tripped).toBe(0);
  });
});
