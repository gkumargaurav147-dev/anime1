import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  CATEGORIES,
  MAX_AVATARS,
  PlaceholderAssetProvider,
  SceneSchema,
  composeScene,
  defaultCatalog,
  loadCatalog,
  renderSvg,
  sceneFromCatalog,
  suggestScene,
  tierFor,
  type Scene,
} from '../src';
import { corpus } from './corpus';
import { evaluate, report } from './evaluate';
import { holdout } from './holdout';

describe('acceptance', () => {
  it('"Can we go out for dinner tonight?" → two avatars, evening restaurant, "Dinner tonight?"', () => {
    const r = suggestScene('Can we go out for dinner tonight?', { age: 25 });
    expect(r.tier).toBe('auto');
    expect(r.scene).not.toBeNull();
    const s = r.scene!;
    expect(s.characters).toHaveLength(2);
    expect(s.setting).toMatchObject({ place: 'restaurant', time_of_day: 'evening' });
    expect(s.speech_bubble?.text).toBe('Dinner tonight?');
    expect(s.catalog_scene_id).toBe('dinner_out');
    expect(SceneSchema.safeParse(s).success).toBe(true);
  });
});

describe('catalog', () => {
  const catalog = defaultCatalog();

  it('is versioned and has 13 categories with at least 8 scenes each', () => {
    expect(catalog.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(catalog.categories()).toEqual([...CATEGORIES]);
    for (const c of CATEGORIES) expect(catalog.byCategory(c).length).toBeGreaterThanOrEqual(8);
  });

  it('covers the required food and travel scenes', () => {
    const tags = (cat: (typeof CATEGORIES)[number]) =>
      catalog
        .byCategory(cat)
        .flatMap((s) => s.tags)
        .join(' ');
    for (const w of ['dinner', 'lunch', 'tea', 'coffee', 'boba', 'pizza', 'ramen']) {
      expect(tags('food_and_drink')).toContain(w);
    }
    for (const w of ['road trip', 'flight', 'train', 'beach', 'hotel', 'stuck in traffic']) {
      expect(tags('travel')).toContain(w);
    }
  });

  it('marks every Date and Romance scene 18+', () => {
    for (const s of catalog.byCategory('date_and_romance')) expect(s.min_age).toBe(18);
  });

  it('rejects an invalid catalog with a readable error', () => {
    expect(() => loadCatalog({ version: '1.0.0', scenes: [{ scene_id: 'Bad Id' }] })).toThrow(
      /Invalid scene catalog/,
    );
    const one = catalog.scenes[0]!;
    expect(() => loadCatalog({ version: '1.0.0', scenes: [one, one] })).toThrow(/duplicate/);
  });
});

describe('parser behaviour', () => {
  it('maps confidence to tiers at 0.75 and 0.40', () => {
    expect(tierFor(0.75)).toBe('auto');
    expect(tierFor(0.749)).toBe('chips');
    expect(tierFor(0.4)).toBe('chips');
    expect(tierFor(0.399)).toBe('none');
  });

  it('gives no scene (picker only) for low confidence', () => {
    const r = suggestScene('The invoice number is 4471-B', { age: 25 });
    expect(r.tier).toBe('none');
    expect(r.scene).toBeNull();
  });

  it('returns at most three alternatives, best first', () => {
    const r = suggestScene('pizza or ramen tonight?', { age: 25 });
    expect(r.alternatives.length).toBeLessThanOrEqual(3);
    const confs = r.alternatives.map((a) => a.confidence);
    expect([...confs].sort((a, b) => b - a)).toEqual(confs);
    expect(r.alternatives.map((a) => a.scene_id)).toEqual(
      expect.arrayContaining(['pizza_party', 'ramen_slurp']),
    );
  });

  it('negation changes the scene', () => {
    expect(suggestScene('Coming tonight', { age: 25 }).scene?.catalog_scene_id).toBe('on_my_way');
    const not = suggestScene('Not coming tonight', { age: 25 });
    expect(not.scene?.catalog_scene_id).toBe('cancel_plans');
    expect(not.scene?.speech_bubble?.text).toBe('Not tonight, sorry!');
    expect(not.parse.negation.present).toBe(true);
  });

  it('detects intents, entities and questions', () => {
    const p = suggestScene('Can we go out for dinner tonight?', { age: 25 }).parse;
    expect(p.intent).toBe('invite');
    expect(p.isQuestion).toBe(true);
    expect(p.entities).toEqual(
      expect.arrayContaining([
        { kind: 'food', value: 'dinner', negated: false },
        { kind: 'time', value: 'tonight', negated: false },
      ]),
    );
    expect(suggestScene('Thank you so much!').parse.intent).toBe('thank');
    expect(suggestScene("I'm so sorry").parse.intent).toBe('apologize');
    expect(suggestScene('Hi there').parse.intent).toBe('greet');
  });

  it('lowers confidence when sarcasm is likely', () => {
    const plain = suggestScene('Stuck in traffic again', { age: 25 });
    const sarcastic = suggestScene('Oh great, stuck in traffic again 🙄', { age: 25 });
    expect(sarcastic.parse.sarcasm.likely).toBe(true);
    expect(sarcastic.confidence).toBeLessThan(plain.confidence);
    expect(sarcastic.tier).not.toBe('auto');
  });
});

describe('age gate (engine level)', () => {
  const romantic = new Set(
    defaultCatalog()
      .byCategory('date_and_romance')
      .map((s) => s.scene_id),
  );

  it('never returns a romantic scene to a minor, even as an alternative', () => {
    for (const { text } of corpus) {
      const r = suggestScene(text, { age: 15 });
      expect(romantic.has(r.scene?.catalog_scene_id ?? '')).toBe(false);
      for (const a of r.alternatives) expect(romantic.has(a.scene_id)).toBe(false);
    }
  });

  it('shows romantic scenes to adults', () => {
    expect(
      suggestScene('Romantic dinner tonight?', { age: 25 }).alternatives.map((a) => a.scene_id),
    ).toContain('romantic_dinner');
    expect(
      suggestScene('Romantic dinner tonight?', { ageBracket: 'teen' }).scene?.catalog_scene_id,
    ).toBe('dinner_out');
  });

  it('treats unknown age as a minor and blocks picking 18+ scenes by id', () => {
    expect(suggestScene('Date night?').alternatives.map((a) => a.scene_id)).not.toContain(
      'date_night',
    );
    expect(sceneFromCatalog('date_night', { age: 15 })).toBeNull();
    expect(sceneFromCatalog('date_night')).toBeNull();
    expect(sceneFromCatalog('date_night', { age: 18 })?.catalog_scene_id).toBe('date_night');
  });
});

describe('layer composer', () => {
  const assets = new PlaceholderAssetProvider();
  const base = suggestScene('Can we go out for dinner tonight?', { age: 25 }).scene!;
  const withCrowd = (n: number): Scene => ({
    ...base,
    characters: Array.from({ length: n }, (_, i) => ({
      ...base.characters[0]!,
      role: i ? 'crowd' : 'sender',
    })),
  });

  it('stacks background, props, avatars, effects and bubble in that order', () => {
    const c = composeScene(sceneFromCatalog('birthday_cake', { bubbleText: 'HBD!' })!, assets);
    const order = c.layers.map((l) => l.kind);
    expect(order[0]).toBe('background');
    expect(order.at(-1)).toBe('bubble');
    expect(order.indexOf('prop')).toBeLessThan(order.indexOf('avatar'));
    expect(order.lastIndexOf('avatar')).toBeLessThan(order.indexOf('effect'));
  });

  it('places 1, 2 and 500 avatars and shares one asset between identical ones', () => {
    expect(
      composeScene(withCrowd(1), assets).layers.filter((l) => l.kind === 'avatar'),
    ).toHaveLength(1);
    const pair = composeScene(withCrowd(2), assets).layers.filter((l) => l.kind === 'avatar');
    expect(pair[1]!.flip).toBe(true);

    const crowd = composeScene(withCrowd(MAX_AVATARS), assets);
    const avatars = crowd.layers.filter((l) => l.kind === 'avatar');
    expect(avatars).toHaveLength(500);
    expect(Object.keys(crowd.assets).filter((k) => k.startsWith('avatar:'))).toHaveLength(1);
    for (const a of avatars) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(crowd.width);
    }
  });

  it('rejects more than 500 avatars at the schema level', () => {
    expect(SceneSchema.safeParse(withCrowd(MAX_AVATARS + 1)).success).toBe(false);
  });

  it('never emits undefined colours or NaN coordinates', () => {
    for (let i = 0; i < 200; i++) {
      const ref = assets.avatar(`user_${i}`, 'smile', 'wave');
      expect(ref.format === 'svg' && ref.svg).not.toMatch(/undefined|NaN/);
    }
    const svg = renderSvg(composeScene(withCrowd(MAX_AVATARS), assets));
    expect(svg).not.toMatch(/undefined|NaN/);
  });

  it('renders every catalog scene to SVG with placeholder art', () => {
    for (const s of defaultCatalog().scenes) {
      const scene = sceneFromCatalog(s.scene_id, { age: 30, bubbleText: 'Hi!' })!;
      const svg = renderSvg(composeScene(scene, assets));
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('<use href=');
    }
  });
});

describe('CLI', () => {
  it('prints the scene JSON', () => {
    const cli = path.resolve(__dirname, '..', 'src', 'cli.ts');
    const out = execFileSync(
      process.execPath,
      [require.resolve('tsx/cli'), cli, 'Can we go out for dinner tonight?'],
      {
        encoding: 'utf8',
      },
    );
    const scene = JSON.parse(out) as Scene;
    expect(scene.speech_bubble?.text).toBe('Dinner tonight?');
    expect(scene.characters).toHaveLength(2);
  }, 30_000);
});

describe('500-sentence corpus', () => {
  it('has 500+ sentences including 50 negation/sarcasm cases', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(500);
    expect(corpus.filter((c) => c.kind).length).toBeGreaterThanOrEqual(50);
    expect(corpus.filter((c) => c.kind === 'sarcasm').length).toBeGreaterThanOrEqual(20);
  });

  it('meets the accuracy floor and prints the report', () => {
    const results = evaluate();
    console.log(report(results, 60));
    const acc = results.filter((r) => r.pass).length / results.length;
    // Regression guard: tuned corpus. Raise it as rules improve.
    expect(acc).toBeGreaterThanOrEqual(0.95);
  });

  it('held-out set stays above its floor (never tuned on)', () => {
    const results = evaluate(holdout);
    const acc = results.filter((r) => r.pass).length / results.length;
    expect(acc).toBeGreaterThanOrEqual(0.7);
  });
});
