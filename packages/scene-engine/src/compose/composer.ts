import type { AssetProvider, AssetRef } from '../assets/AssetProvider';
import { SCENE_EXPRESSION_TO_ID } from '../avatar/expressions';
import { AvatarDirectory } from '../avatar/model';
import { LevelASvgRenderer, type AvatarRenderer } from '../avatar/renderer';
import { MAX_AVATARS, type Scene } from '../schema';

export type LayerKind = 'background' | 'prop' | 'avatar' | 'effect' | 'bubble';

/** One placed instance of a shared asset. Many layers can point at the same asset. */
export interface Layer {
  kind: LayerKind;
  /** Key into ComposedScene.assets. */
  asset: string;
  /** Where the asset's anchor lands on the canvas. */
  x: number;
  y: number;
  scale: number;
  flip: boolean;
  z: number;
}

export interface ComposedScene {
  width: number;
  height: number;
  /** Unique assets used by this scene (deduplicated: 500 identical avatars = 1 asset). */
  assets: Record<string, AssetRef>;
  layers: Layer[];
}

const Z = { background: 0, prop: 100, avatar: 200, effect: 10_000, bubble: 20_000 } as const;

/** Feet positions and scale for n avatars: 1 centred, 2 facing, a row, then a crowd. */
export function layoutAvatars(n: number, width: number, height: number) {
  const ground = height * 0.88;
  if (n === 1) return [{ x: width / 2, y: ground, scale: 1 }];
  if (n === 2) {
    return [
      { x: width * 0.32, y: ground, scale: 1 },
      { x: width * 0.68, y: ground, scale: 1 },
    ];
  }
  if (n <= 8) {
    const scale = Math.max(0.6, 1 - (n - 2) * 0.07);
    const step = (width * 0.84) / (n - 1);
    return Array.from({ length: n }, (_, i) => ({ x: width * 0.08 + i * step, y: ground, scale }));
  }
  // Crowd: rows with perspective. Index 0 (the speaker) and the first characters fill the front
  // row; later ones go further back (smaller, higher). Back rows hold more people.
  const rows = Math.min(16, Math.max(2, Math.ceil(Math.sqrt(n / 2))));
  const weights = Array.from({ length: rows }, (_, r) => 1 + r * 0.25); // r = 0 front
  const total = weights.reduce((a, b) => a + b, 0);
  const out: { x: number; y: number; scale: number }[] = [];
  const top = height * 0.4;
  for (let r = 0; r < rows && out.length < n; r++) {
    const depth = rows === 1 ? 0 : r / (rows - 1); // 0 = front, 1 = back
    const scale = 0.7 - depth * 0.5;
    const y = ground - depth * (ground - top);
    const count =
      r === rows - 1
        ? n - out.length
        : Math.min(n - out.length, Math.round((n * weights[r]!) / total));
    const step = width / Math.max(1, count);
    for (let i = 0; i < count; i++) {
      out.push({ x: step * (i + 0.5) + (r % 2 ? step / 3 : 0), y, scale });
    }
  }
  return out;
}

export interface ComposeOptions {
  /** How avatars are drawn. Defaults to the Level A bust renderer. */
  avatarRenderer?: AvatarRenderer;
  /** avatar_id → saved avatar. Unknown ids get a deterministic default avatar. */
  avatars?: AvatarDirectory;
  /** 'bust' (M5 avatar system, default) or the old full-body 'figure' placeholders. */
  avatarStyle?: 'bust' | 'figure';
}

/** Bust size (px on the 400×300 canvas) by number of characters. */
const bustSize = (n: number, depthScale: number) =>
  (n === 1 ? 214 : n === 2 ? 196 : n <= 8 ? Math.max(110, 196 - (n - 2) * 14) : 150) * depthScale;

const defaultRenderer = new LevelASvgRenderer();

/**
 * Turns a scene description into layers: background → props → avatars (back to front) →
 * effects → speech bubble. Assets are fetched once per unique key and shared by every layer
 * that uses them, so combining a handful of art pieces yields many distinct scenes.
 */
export function composeScene(
  scene: Scene,
  assets: AssetProvider,
  opts: ComposeOptions = {},
): ComposedScene {
  const busts = (opts.avatarStyle ?? 'bust') === 'bust';
  const renderer = opts.avatarRenderer ?? defaultRenderer;
  const directory = opts.avatars ?? new AvatarDirectory();
  const { width, height } = assets.canvas;
  const used: Record<string, AssetRef> = {};
  const layers: Layer[] = [];
  const use = (key: string, make: () => AssetRef) => {
    used[key] ??= make();
    return key;
  };

  const bg = use(`bg:${scene.setting.background}:${scene.setting.time_of_day}`, () =>
    assets.background(scene.setting.background, scene.setting.time_of_day),
  );
  layers.push({
    kind: 'background',
    asset: bg,
    x: 0,
    y: 0,
    scale: 1,
    flip: false,
    z: Z.background,
  });

  const characters = scene.characters.slice(0, MAX_AVATARS);
  const spots = layoutAvatars(characters.length, width, height);

  // Props sit on the ground between/around the characters.
  scene.props.forEach((p, i) => {
    const key = use(`prop:${p}`, () => assets.prop(p));
    const x =
      p === 'table'
        ? width / 2
        : characters.length <= 2
          ? width / 2 + (i % 2 ? 1 : -1) * (24 + Math.floor(i / 2) * 30)
          : width * ((i + 1) / (scene.props.length + 1));
    layers.push({
      kind: 'prop',
      asset: key,
      x,
      y: busts ? height * (p === 'table' ? 1.0 : 0.97) : height * (p === 'table' ? 0.86 : 0.9),
      scale: 1,
      flip: false,
      // With busts, props (table, popcorn…) sit in front of the characters.
      z: busts ? Z.effect - 100 + i : Z.prop + i,
    });
  });

  const bustTops: number[] = [];
  characters.forEach((c, i) => {
    const spot = spots[i]!;
    const flip = characters.length === 2 && i === 1;
    let key: string;
    let scale = spot.scale;
    let y = spot.y;
    if (busts) {
      const expressionId = c.expression_id ?? SCENE_EXPRESSION_TO_ID[c.expression];
      const gesture = c.gesture ?? null;
      key = `bust:${c.avatar_id}:${expressionId}:${gesture}:${c.intensity ?? 2}:${c.framing ?? 'none'}:${c.glow ?? ''}`;
      use(key, () =>
        renderer.renderStill(
          {
            config: directory.get(c.avatar_id),
            avatarId: c.avatar_id,
            expressionId,
            intensity: c.intensity,
            gestureId: gesture,
            // Show the gesture at its held pose.
            gestureElapsedMs: gesture ? 900 : 0,
            framing: c.framing ?? (c.glow ? 'circle' : 'none'),
            glow: c.glow ?? null,
            idPrefix: `b${i}_${c.avatar_id.replace(/[^a-zA-Z0-9]/g, '')}_${expressionId}_`,
          },
          0,
          { idle: false },
        ),
      );
      const size = bustSize(characters.length, characters.length > 8 ? spot.scale / 0.7 : 1);
      scale = size / 256;
      y = characters.length > 8 ? spot.y + 20 * scale : height;
      bustTops.push(y - size * 0.92);
    } else {
      key = use(`avatar:${c.avatar_id}:${c.expression}:${c.action}`, () =>
        assets.avatar(c.avatar_id, c.expression, c.action),
      );
      bustTops.push(spot.y - 125 * spot.scale);
    }
    layers.push({
      kind: 'avatar',
      asset: key,
      x: spot.x,
      y,
      scale,
      // The second of a pair faces the first.
      flip,
      // Lower on screen = closer = drawn later.
      z: Z.avatar + Math.round(y * 10) + i / 1000,
    });
  });

  scene.effects.forEach((e, i) => {
    const key = use(`fx:${e}`, () => assets.effect(e));
    layers.push({ kind: 'effect', asset: key, x: 0, y: 0, scale: 1, flip: false, z: Z.effect + i });
  });

  if (scene.speech_bubble) {
    const speakerIdx = Math.min(scene.speech_bubble.speaker, spots.length - 1);
    const speaker = spots[speakerIdx]!;
    const ref = assets.bubble(scene.speech_bubble.text);
    const key = use(`bubble:${scene.speech_bubble.text}`, () => ref);
    const avatarTop = bustTops[speakerIdx]!;
    const x = Math.min(width - ref.width / 2 - 4, Math.max(ref.width / 2 + 4, speaker.x));
    layers.push({
      kind: 'bubble',
      asset: key,
      x,
      y: Math.max(ref.height + 4, avatarTop),
      scale: 1,
      flip: false,
      z: Z.bubble,
    });
  }

  layers.sort((a, b) => a.z - b.z);
  return { width, height, assets: used, layers };
}

const idFor = (key: string) => `a_${key.replace(/[^a-zA-Z0-9]+/g, '_')}`;

/** Renders a composed scene to a standalone SVG (assets defined once, placed with <use>). */
export function renderSvg(composed: ComposedScene): string {
  const defs = Object.entries(composed.assets)
    .map(([key, ref]) =>
      ref.format === 'svg'
        ? `<g id="${idFor(key)}">${ref.svg}</g>`
        : `<g id="${idFor(key)}"><rect width="${ref.width}" height="${ref.height}" fill="#ddd"/></g>`,
    )
    .join('');
  const uses = composed.layers
    .map((l) => {
      const ref = composed.assets[l.asset]!;
      const [ax, ay] = ref.anchor;
      const sx = l.flip ? -l.scale : l.scale;
      const t = `translate(${round(l.x)} ${round(l.y)}) scale(${round(sx)} ${round(l.scale)}) translate(${-ax} ${-ay})`;
      return `<use href="#${idFor(l.asset)}" transform="${t}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${composed.width} ${composed.height}" width="${composed.width}" height="${composed.height}"><defs>${defs}</defs>${uses}</svg>`;
}

const round = (n: number) => Math.round(n * 100) / 100;
