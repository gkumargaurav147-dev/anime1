import type { AvatarFrame } from '../animation';
import type { HandPose } from '../expressions';
import {
  ACCENT_PALETTE,
  EYE_PALETTE,
  HAIR_PALETTE,
  SKIN_PALETTE,
  hash32,
  avatarKey,
  type AvatarConfig,
} from '../model';
import { h, p, type SvgNode } from '../svg';

/**
 * Level A: a 2.5D bust drawn from layered SVG shapes with soft radial-gradient shading.
 * Everything is generated from the avatar config + one AvatarFrame, so it is deterministic
 * (same input → identical SVG) and fully customisable without an art tool.
 *
 * Coordinate space: 256×256, head centre (128,104), chin ≈ y166, shoulders from y≈196.
 * "Left"/"Right" blendshapes follow the avatar's own sides: the avatar's left eye is drawn on
 * the viewer's right (same convention as the 3D spec in ASSET_SPEC.md).
 */

export type Framing = 'circle' | 'square' | 'none';

export interface BustOptions {
  framing?: Framing;
  /** Unique prefix for gradient/clip ids when several avatars share one SVG document. */
  idPrefix?: string;
  /** Mood glow behind the avatar (defaults to the frame's glow colour). */
  glow?: string | null;
  /** Mirror horizontally (second avatar in a pair faces the first). */
  flip?: boolean;
}

const CX = 128;
const CY = 104;
const W = 256;

// ---------- colour helpers ----------

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ---------- geometry tables ----------

const FACE = {
  round: { rx: 58, rt: 62, rb: 62, jw: 0.56, j1: 0.62 },
  oval: { rx: 54, rt: 64, rb: 68, jw: 0.46, j1: 0.56 },
  soft_square: { rx: 58, rt: 61, rb: 61, jw: 0.8, j1: 0.78 },
  heart: { rx: 60, rt: 63, rb: 67, jw: 0.32, j1: 0.48 },
  long: { rx: 51, rt: 68, rb: 72, jw: 0.5, j1: 0.6 },
  wide: { rx: 64, rt: 59, rb: 58, jw: 0.62, j1: 0.62 },
} as const;

const EYE = {
  round: { w: 13, h: 15, tilt: 0 },
  almond: { w: 15, h: 11.5, tilt: 5 },
  droopy: { w: 14, h: 12.5, tilt: -6 },
  upturned: { w: 14, h: 12.5, tilt: 8 },
  wide: { w: 15.5, h: 15, tilt: 0 },
  narrow: { w: 14.5, h: 9, tilt: 3 },
} as const;

const BROW = {
  soft: { arch: 3, w: 4.2, peak: 0.5 },
  straight: { arch: 0.5, w: 4.6, peak: 0.5 },
  arched: { arch: 6.5, w: 3.8, peak: 0.55 },
  thick: { arch: 3, w: 7, peak: 0.5 },
  thin: { arch: 3.5, w: 2.3, peak: 0.5 },
  angled: { arch: 6, w: 4.6, peak: 0.72 },
} as const;

const MOUTH = {
  soft: { w: 30, lip: 3.6 },
  full: { w: 32, lip: 5.2 },
  thin: { w: 29, lip: 2.8 },
  wide: { w: 38, lip: 3.8 },
  small: { w: 23, lip: 3.4 },
  heart: { w: 27, lip: 4.8 },
} as const;

/** Big-head emoji proportions: the head (and hair) are scaled up around the chin. */
const HEAD_SCALE = 1.22;
const HEAD_PIVOT = `translate(128 172) scale(${HEAD_SCALE}) translate(-128 -172)`;

const OUTFIT: Record<AvatarConfig['outfit'], (accent: [string, string]) => [string, string]> = {
  tee: (a) => [a[0], a[1]],
  hoodie: (a) => [mix(a[0], '#222233', 0.15), mix(a[1], '#111122', 0.2)],
  jacket: () => ['#34395E', '#22263F'],
  sweater: (a) => [mix(a[0], '#FFFFFF', 0.15), a[1]],
  shirt: () => ['#F4F5FA', '#D3D6E3'],
  denim_jacket: () => ['#5A7FB5', '#3D5C8C'],
};

// ---------- main ----------

export function renderBust(c: AvatarConfig, f: AvatarFrame, opts: BustOptions = {}): SvgNode {
  const id = opts.idPrefix ?? `av${hash32(avatarKey(c)).toString(36)}`;
  const framing = opts.framing ?? 'circle';
  const [skin, skinShadow, skinLight] = SKIN_PALETTE[c.skinTone];
  const [hair, hairShadow, hairLight] = HAIR_PALETTE[c.hairColor];
  const [iris, irisDark] = EYE_PALETTE[c.eyeColor];
  const accent = ACCENT_PALETTE[c.accentColor];
  const [cloth, clothShadow] = OUTFIT[c.outfit](accent);
  const wgt = (k: string) => clamp01(f.weights[k] ?? 0);
  const face = FACE[c.faceShape];
  const fx = new Set(f.fx);

  const yaw = Math.max(-25, Math.min(25, f.head.yaw));
  const pitch = Math.max(-25, Math.min(30, f.head.pitch));
  const roll = Math.max(-25, Math.min(25, f.head.roll));
  const breath = f.breath;

  // 2.5D parallax: facial features slide with yaw/pitch, hair a bit less, ears the other way.
  const fxX = CX + yaw * 0.85;
  const fxY = CY + pitch * 0.55;
  const hairX = yaw * 0.45;
  const puff = wgt('cheekPuff') * 7;

  const defs: SvgNode[] = [
    radial(
      `${id}skin`,
      [
        [0, skinLight],
        [0.55, skin],
        [1, skinShadow],
      ],
      0.42,
      0.32,
      0.78,
    ),
    radial(
      `${id}hair`,
      [
        [0, hairLight],
        [0.5, hair],
        [1, hairShadow],
      ],
      0.4,
      0.2,
      0.9,
    ),
    radial(
      `${id}cloth`,
      [
        [0, mix(cloth, '#FFFFFF', 0.18)],
        [0.6, cloth],
        [1, clothShadow],
      ],
      0.5,
      0.1,
      1,
    ),
    linear(`${id}neck`, [
      [0, skinShadow],
      [0.35, skin],
      [1, skin],
    ]),
    radial(
      `${id}iris`,
      [
        [0, mix(iris, '#FFFFFF', 0.35)],
        [0.55, iris],
        [1, irisDark],
      ],
      0.5,
      0.65,
      0.6,
    ),
    radial(
      `${id}sclera`,
      [
        [0, '#FFFFFF'],
        [0.8, '#F4F1F6'],
        [1, '#DCD6E2'],
      ],
      0.5,
      0.35,
      0.7,
    ),
    radial(
      `${id}glow`,
      [
        [0, opts.glow ?? f.glow],
        [1, mix(opts.glow ?? f.glow, '#FFFFFF', 0.75)],
      ],
      0.5,
      0.45,
      0.7,
    ),
  ];

  // ---------- body (moves with breathing / bowing) ----------
  const bodyY = -breath * 2 + f.bodyDy * 0.4;
  const body = h(
    'g',
    { transform: `translate(0 ${bodyY.toFixed(2)})` },
    h('g', { transform: HEAD_PIVOT }, backHair(c.hairStyle, id, hairX, roll, pitch)),
    h('path', {
      d: p`M8 262 C8 226 44 204 96 198 Q128 210 160 198 C212 204 248 226 248 262 Z`,
      fill: `url(#${id}cloth)`,
    }),
    outfitDetails(c.outfit, cloth, clothShadow, accent),
    collarBack(c.collar, cloth, clothShadow),
    h('rect', { x: CX - 19, y: 138, width: 38, height: 70, rx: 14, fill: `url(#${id}neck)` }),
    collarFront(c.collar, cloth, clothShadow, skin, skinShadow),
  );

  // ---------- head ----------
  const headY = -breath * 1.2 + f.bodyDy * 0.9;
  const earX = (side: 1 | -1) => CX + side * (face.rx - 3) - yaw * 0.35;
  const ears = ([-1, 1] as const).map((side) =>
    h(
      'g',
      {},
      h('ellipse', { cx: earX(side), cy: CY + 10, rx: 9, ry: 13, fill: `url(#${id}skin)` }),
      h('path', {
        d: p`M${earX(side) + side * 1} ${CY + 3} q${side * 4} 6 0 14`,
        stroke: skinShadow,
        'stroke-width': 2.2,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
      earring(c.earrings, earX(side), CY + 23, side, accent),
    ),
  );

  const faceNode = h('path', {
    d: facePath(CX + yaw * 0.25, CY + pitch * 0.15, face, puff),
    fill: `url(#${id}skin)`,
  });

  const cheekY = fxY + 24;
  const blush =
    0.18 +
    wgt('cheekSquintLeft') * 0.15 +
    (c.marks === 'rosy_cheeks' ? 0.2 : 0) +
    (fx.has('blush') ? 0.35 : 0);
  const cheeks = ([-1, 1] as const).map((s) =>
    h('ellipse', {
      cx: fxX + s * 34,
      cy: cheekY,
      rx: 11,
      ry: 7,
      fill: '#FF7F8E',
      opacity: blush.toFixed(2),
    }),
  );

  const eyeY = fxY + 6;
  const eyes = ([-1, 1] as const).map((s) => eye(s, fxX + s * 25, eyeY, c, wgt, id, fx));
  const brows = ([-1, 1] as const).map((s) =>
    brow(s, fxX + s * 25, eyeY - 25, BROW[c.eyebrows], wgt, mix(hair, '#1E1A22', 0.3)),
  );

  const head = h(
    'g',
    {
      transform: `translate(0 ${headY.toFixed(2)}) rotate(${roll.toFixed(2)} ${CX} 172) ${HEAD_PIVOT}`,
    },
    ears,
    faceNode,
    // soft jaw shadow + forehead sheen for the 3D-ish look
    h('ellipse', { cx: fxX, cy: CY - 38, rx: 26, ry: 12, fill: '#FFFFFF', opacity: 0.18 }),
    cheeks,
    marks(c.marks, fxX, fxY, skinShadow, accent),
    facialHair(c.facialHair, fxX, fxY, hair, 'under'),
    eyes,
    brows,
    nose(c.nose, fxX, fxY + 27, wgt('noseSneerLeft'), skinShadow),
    mouth(c, fxX, fxY + 45, wgt, skin, skinShadow, id),
    facialHair(c.facialHair, fxX, fxY, hair, 'over'),
    glasses(c.glasses, fxX, eyeY, accent),
    frontHair(c.hairStyle, id, CX + hairX, CY + pitch * 0.25, face, hairLight),
    faceFx(fx, fxX, fxY, eyeY),
  );

  const hands = h(
    'g',
    {},
    arm(f.hands.left, -1, cloth, skin, skinShadow, id),
    arm(f.hands.right, 1, cloth, skin, skinShadow, id),
  );

  const frameClip =
    framing === 'circle'
      ? h('clipPath', { id: `${id}frame` }, h('circle', { cx: 128, cy: 128, r: 128 }))
      : framing === 'square'
        ? h(
            'clipPath',
            { id: `${id}frame` },
            h('rect', { x: 0, y: 0, width: W, height: W, rx: 40 }),
          )
        : null;
  if (frameClip) defs.push(frameClip);

  const background =
    framing === 'none' || opts.glow === null
      ? null
      : h('rect', { x: 0, y: 0, width: W, height: W, fill: `url(#${id}glow)` });

  const content = h(
    'g',
    { transform: opts.flip ? `translate(${W} 0) scale(-1 1)` : undefined },
    body,
    head,
    hands,
    floatingFx(fx, accent),
  );

  return h(
    'g',
    {},
    h('defs', {}, defs),
    h('g', frameClip ? { 'clip-path': `url(#${id}frame)` } : {}, background, content),
  );
}

/** Full standalone SVG document. */
export function renderBustSvgNode(
  c: AvatarConfig,
  f: AvatarFrame,
  opts: BustOptions = {},
): SvgNode {
  return h(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 256 256', width: 256, height: 256 },
    renderBust(c, f, opts),
  );
}

// ---------- gradients ----------

function radial(id: string, stops: [number, string][], cx: number, cy: number, r: number): SvgNode {
  return h(
    'radialGradient',
    { id, cx, cy, r },
    stops.map(([o, col]) => h('stop', { offset: o, 'stop-color': col })),
  );
}
function linear(id: string, stops: [number, string][]): SvgNode {
  return h(
    'linearGradient',
    { id, x1: 0, y1: 0, x2: 0, y2: 1 },
    stops.map(([o, col]) => h('stop', { offset: o, 'stop-color': col })),
  );
}

// ---------- face ----------

function facePath(cx: number, cy: number, f: (typeof FACE)[keyof typeof FACE], puff: number) {
  const { rx, rt, rb, jw, j1 } = f;
  return p`M${cx} ${cy - rt} C${cx + rx * 0.56} ${cy - rt} ${cx + rx} ${cy - rt * 0.55} ${cx + rx} ${cy} C${cx + rx + puff} ${cy + rb * j1} ${cx + rx * jw} ${cy + rb} ${cx} ${cy + rb} C${cx - rx * jw} ${cy + rb} ${cx - rx - puff} ${cy + rb * j1} ${cx - rx} ${cy} C${cx - rx} ${cy - rt * 0.55} ${cx - rx * 0.56} ${cy - rt} ${cx} ${cy - rt} Z`;
}

type Wgt = (k: string) => number;
const sideName = (s: 1 | -1) => (s === 1 ? 'Left' : 'Right'); // viewer-right = avatar's left

function eye(
  s: 1 | -1,
  ex: number,
  ey: number,
  c: AvatarConfig,
  wgt: Wgt,
  id: string,
  fx: Set<string>,
): SvgNode {
  const shape = EYE[c.eyeShape];
  const w = shape.w * 1.12;
  const hh = shape.h * 1.12;
  const blink = wgt(`eyeBlink${sideName(s)}`);
  const squint = wgt(`eyeSquint${sideName(s)}`);
  const wide = wgt(`eyeWide${sideName(s)}`);
  const smile = (wgt('mouthSmileLeft') + wgt('mouthSmileRight')) / 2;
  // Blink is boosted slightly so a 0.8 "eyes closed" still fully closes after intensity scaling.
  const openTop = clamp01(1 - blink * 1.3 - squint * 0.35) * (1 + wide * 0.25);
  const lash = '#2B2230';
  const rotate = `rotate(${(-shape.tilt * s).toFixed(1)} ${ex.toFixed(2)} ${ey.toFixed(2)})`;

  if (openTop < 0.2) {
    // Closed: happy "^" arc when smiling, soft downward lid otherwise.
    const d =
      smile > 0.35
        ? p`M${ex - w} ${ey + 3} Q${ex} ${ey - 9} ${ex + w} ${ey + 3}`
        : p`M${ex - w} ${ey} Q${ex} ${ey + 6} ${ex + w} ${ey}`;
    return h('path', {
      d,
      stroke: lash,
      'stroke-width': 3.2,
      fill: 'none',
      'stroke-linecap': 'round',
      transform: rotate,
    });
  }

  const top = ey - hh + 2 * hh * (1 - Math.min(1, openTop));
  const bottom = ey + hh * (1 + wide * 0.1) - hh * 0.5 * squint;
  const cy = (top + bottom) / 2;
  const ry = Math.max(1, (bottom - top) / 2);
  const clipId = `${id}eye${s === 1 ? 'L' : 'R'}`;
  const lookX = (wgt('eyeLookRight') - wgt('eyeLookLeft')) * 5;
  const lookY = (wgt('eyeLookDown') - wgt('eyeLookUp')) * 4;
  const ix = ex + lookX;
  const iy = ey + lookY + 1;
  const r = Math.min(w, hh) * 0.8;

  let irisNode: SvgNode | SvgNode[];
  if (fx.has('heart_eyes')) {
    irisNode = h('path', {
      d: p`M${ix} ${iy + r * 0.8} l${-r} ${-r} a${r * 0.52} ${r * 0.52} 0 0 1 ${r} ${-r * 0.5} a${r * 0.52} ${r * 0.52} 0 0 1 ${r} ${r * 0.5} z`,
      fill: '#F0446B',
    });
  } else if (fx.has('star_eyes')) {
    irisNode = h('path', {
      d: star(ix, iy, r, r * 0.45),
      fill: '#FFC93C',
      stroke: '#E09B12',
      'stroke-width': 1,
    });
  } else if (fx.has('dizzy_eyes')) {
    irisNode = h('path', {
      d: p`M${ix} ${iy} m-1 0 a1 1 0 1 1 2 0 a3 3 0 1 1 -6 0 a5 5 0 1 1 10 0 a7 7 0 1 1 -14 0`,
      stroke: lash,
      'stroke-width': 1.6,
      fill: 'none',
    });
  } else {
    irisNode = [
      h('circle', { cx: ix, cy: iy, r, fill: `url(#${id}iris)` }),
      h('circle', { cx: ix, cy: iy, r: r * 0.46, fill: '#16121A' }),
      h('circle', { cx: ix + r * 0.38, cy: iy - r * 0.4, r: r * 0.34, fill: '#FFFFFF' }),
      h('circle', {
        cx: ix - r * 0.36,
        cy: iy + r * 0.36,
        r: r * 0.15,
        fill: '#FFFFFF',
        opacity: 0.9,
      }),
      fx.has('sparkle_eyes')
        ? h('circle', { cx: ix - r * 0.1, cy: iy - r * 0.55, r: r * 0.18, fill: '#FFFFFF' })
        : null,
    ].filter(Boolean) as SvgNode[];
  }

  return h(
    'g',
    { transform: rotate },
    h('clipPath', { id: clipId }, h('ellipse', { cx: ex, cy, rx: w, ry })),
    h(
      'g',
      { 'clip-path': `url(#${clipId})` },
      h('ellipse', { cx: ex, cy: ey, rx: w + 2, ry: hh + 2, fill: `url(#${id}sclera)` }),
      irisNode,
    ),
    // upper lash line + outer flick
    h('path', {
      d: p`M${ex - w} ${cy} A${w} ${ry} 0 0 1 ${ex + w} ${cy}`,
      stroke: lash,
      'stroke-width': 3,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    h('path', {
      d: p`M${ex + s * w} ${cy - 1} l${s * 4} ${-3}`,
      stroke: lash,
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
    }),
  );
}

function brow(
  s: 1 | -1,
  bx: number,
  by: number,
  b: (typeof BROW)[keyof typeof BROW],
  wgt: Wgt,
  color: string,
): SvgNode {
  const down = wgt(`browDown${sideName(s)}`);
  const innerUp = wgt('browInnerUp');
  const outerUp = wgt(`browOuterUp${sideName(s)}`);
  const ix = bx - s * 12;
  const ox = bx + s * 13;
  const iy = by + down * 6 - innerUp * 7;
  const oy = by + down * 1.5 - outerUp * 6 + innerUp * 1.5;
  const mx = ix + (ox - ix) * b.peak;
  const my = Math.min(iy, oy) - b.arch - outerUp * 1.5;
  return h('path', {
    d: p`M${ix} ${iy} Q${mx} ${my} ${ox} ${oy}`,
    stroke: color,
    'stroke-width': b.w * 1.15,
    fill: 'none',
    'stroke-linecap': 'round',
  });
}

function nose(
  style: AvatarConfig['nose'],
  nx: number,
  ny: number,
  sneer: number,
  shadow: string,
): SvgNode {
  const y = ny - sneer * 2;
  const st = {
    stroke: shadow,
    'stroke-width': 2.4,
    fill: 'none',
    'stroke-linecap': 'round',
  } as const;
  const wrinkles =
    sneer > 0.3
      ? [-1, 1].map((s) =>
          h('path', { d: p`M${nx + s * 7} ${y - 10} l${s * 3} ${-4}`, ...st, 'stroke-width': 1.6 }),
        )
      : [];
  const hl = h('circle', { cx: nx - 2, cy: y - 6, r: 2.2, fill: '#FFFFFF', opacity: 0.45 });
  switch (style) {
    case 'button':
      return h(
        'g',
        {},
        h('path', { d: p`M${nx - 5} ${y} Q${nx} ${y + 4} ${nx + 5} ${y}`, ...st }),
        hl,
        wrinkles,
      );
    case 'small':
      return h(
        'g',
        {},
        h('path', { d: p`M${nx - 3} ${y + 1} Q${nx} ${y + 3} ${nx + 3} ${y + 1}`, ...st }),
        wrinkles,
      );
    case 'round':
      return h(
        'g',
        {},
        h('ellipse', { cx: nx, cy: y - 1, rx: 7, ry: 5.5, fill: shadow, opacity: 0.22 }),
        h('path', { d: p`M${nx - 6} ${y + 1} Q${nx} ${y + 5} ${nx + 6} ${y + 1}`, ...st }),
        hl,
        wrinkles,
      );
    case 'pointed':
      return h(
        'g',
        {},
        h('path', {
          d: p`M${nx - 1} ${y - 15} Q${nx + 5} ${y - 2} ${nx + 1} ${y + 2} Q${nx - 3} ${y + 3} ${nx - 5} ${y + 1}`,
          ...st,
        }),
        wrinkles,
      );
    case 'wide':
      return h(
        'g',
        {},
        h('path', { d: p`M${nx - 9} ${y} Q${nx} ${y + 6} ${nx + 9} ${y}`, ...st }),
        hl,
        wrinkles,
      );
    case 'snub':
      return h(
        'g',
        {},
        h('path', { d: p`M${nx - 4} ${y - 1} Q${nx} ${y + 2} ${nx + 4} ${y - 1}`, ...st }),
        h('circle', { cx: nx, cy: y - 4, r: 2.4, fill: '#FFFFFF', opacity: 0.4 }),
        wrinkles,
      );
  }
}

function mouth(
  c: AvatarConfig,
  mx: number,
  my: number,
  wgt: Wgt,
  skin: string,
  skinShadow: string,
  id: string,
): SvgNode {
  const m = MOUTH[c.mouth];
  const smileL = wgt('mouthSmileLeft');
  const smileR = wgt('mouthSmileRight');
  const smile = (smileL + smileR) / 2;
  const frown = (wgt('mouthFrownLeft') + wgt('mouthFrownRight')) / 2;
  const jaw = wgt('jawOpen');
  const pucker = wgt('mouthPucker');
  const funnel = wgt('mouthFunnel');
  const press = (wgt('mouthPressLeft') + wgt('mouthPressRight')) / 2;
  const shift = (wgt('mouthRight') - wgt('mouthLeft')) * 5;
  const tongue = wgt('tongueOut');
  const close = wgt('mouthClose');
  const lipColor = mix(mix(skinShadow, '#D9475E', 0.55), '#000000', 0.05);
  const x = mx + shift;
  const width =
    m.w *
    (1 + 0.28 * smile - 0.5 * pucker - 0.35 * funnel + 0.08 * press) *
    (c.mouth === 'heart' ? 0.95 : 1);
  const half = width / 2;
  // Avatar's left corner is on the viewer's right.
  const yR = my - smileL * 11 + frown * 7 + wgt('mouthShrugUpper') * -1;
  const yL = my - smileR * 11 + frown * 7;
  // A real smile shows teeth (emoji style); a pressed or frowning mouth stays shut.
  const smileOpen = smile > 0.4 && frown < 0.2 && press < 0.4 ? 5 + (smile - 0.4) * 16 : 0;
  const open = Math.max(jaw * 26 * (1 - 0.6 * close) + funnel * 8, smileOpen);

  if (pucker > 0.5 || (funnel > 0.5 && open < 10)) {
    const r = 4 + funnel * 3;
    return h(
      'g',
      {},
      h('ellipse', { cx: x, cy: my, rx: r + 2, ry: r + 3, fill: lipColor }),
      h('ellipse', {
        cx: x,
        cy: my,
        rx: r * (funnel > 0.3 ? 0.6 : 0.3),
        ry: r * (funnel > 0.3 ? 0.7 : 0.25),
        fill: '#5A1F2B',
      }),
    );
  }

  if (open < 2.5) {
    const midY = (yL + yR) / 2 + smile * 7 - frown * 4 - press * 1;
    return h(
      'g',
      {},
      h('path', {
        d: p`M${x - half} ${yL} Q${x} ${midY} ${x + half} ${yR}`,
        stroke: lipColor,
        'stroke-width': Math.max(2.4, m.lip * (1 - press * 0.5)),
        fill: 'none',
        'stroke-linecap': 'round',
      }),
      // soft lower-lip shade
      h('path', {
        d: p`M${x - half * 0.45} ${midY + 4} Q${x} ${midY + 7} ${x + half * 0.45} ${midY + 4}`,
        stroke: skinShadow,
        'stroke-width': 2,
        fill: 'none',
        opacity: 0.5,
        'stroke-linecap': 'round',
      }),
      tongue > 0.3
        ? h('ellipse', {
            cx: x + 2,
            cy: midY + 5 + tongue * 4,
            rx: 6,
            ry: 4 + tongue * 4,
            fill: '#EE7A90',
          })
        : null,
    );
  }

  const topMid = (yL + yR) / 2 - 2 + smile * 3 - wgt('mouthShrugUpper') * 3;
  const botMid = (yL + yR) / 2 + open + smile * 6 - frown * 2;
  const clip = `${id}mouth`;
  const outline = p`M${x - half} ${yL} Q${x} ${topMid - 3} ${x + half} ${yR} Q${x} ${botMid + 4} ${x - half} ${yL} Z`;
  return h(
    'g',
    {},
    h('clipPath', { id: clip }, h('path', { d: outline })),
    h('path', { d: outline, fill: '#5A1F2B' }),
    h(
      'g',
      { 'clip-path': `url(#${clip})` },
      // upper teeth
      h('rect', {
        x: x - half,
        y: topMid - 6,
        width,
        height: 7 + open * 0.15,
        rx: 3,
        fill: '#FFFFFF',
      }),
      // tongue
      h('ellipse', {
        cx: x,
        cy: botMid + 2 - tongue * 2,
        rx: half * 0.55,
        ry: 6 + open * 0.15,
        fill: '#E8697F',
      }),
    ),
    h('path', {
      d: outline,
      stroke: lipColor,
      'stroke-width': Math.max(2, m.lip * 0.7),
      fill: 'none',
      'stroke-linejoin': 'round',
    }),
    tongue > 0.3
      ? h('ellipse', {
          cx: x + 2,
          cy: botMid + 6 + tongue * 5,
          rx: 7,
          ry: 5 + tongue * 5,
          fill: '#EE7A90',
          stroke: '#C9556B',
          'stroke-width': 1,
        })
      : null,
  );
  void skin;
}

// ---------- hair ----------

function capPath(
  cx: number,
  cy: number,
  face: (typeof FACE)[keyof typeof FACE],
  hairline: number,
  extra = 0,
) {
  const rx = face.rx + 5 + extra;
  const top = cy - face.rt - 8 - extra;
  return p`M${cx - rx} ${cy + 6} C${cx - rx - 2} ${top + 10} ${cx - rx * 0.6} ${top} ${cx} ${top} C${cx + rx * 0.6} ${top} ${cx + rx + 2} ${top + 10} ${cx + rx} ${cy + 6} L${cx + rx - 6} ${cy - 8} Q${cx} ${cy - face.rt * hairline} ${cx - rx + 6} ${cy - 8} Z`;
}

function strands(cx: number, cy: number, light: string, n = 4, spread = 34): SvgNode[] {
  return Array.from({ length: n }, (_, i) => {
    const x = cx - spread + (i * 2 * spread) / Math.max(1, n - 1);
    return h('path', {
      d: p`M${x} ${cy - 66} q${(i % 2 ? 1 : -1) * 6} 14 ${(i - n / 2) * 2} 26`,
      stroke: light,
      'stroke-width': 2.2,
      fill: 'none',
      opacity: 0.55,
      'stroke-linecap': 'round',
    });
  });
}

function backHair(
  style: AvatarConfig['hairStyle'],
  id: string,
  dx: number,
  roll: number,
  pitch: number,
): SvgNode | null {
  const fill = `url(#${id}hair)`;
  const cx = CX + dx;
  const cy = CY + pitch * 0.2;
  const t = `rotate(${(roll * 0.8).toFixed(2)} ${CX} 172)`;
  switch (style) {
    case 'afro':
      return h('g', { transform: t }, h('circle', { cx, cy: cy - 18, r: 88, fill }));
    case 'bob':
      return h(
        'g',
        { transform: t },
        h('path', {
          d: p`M${cx - 70} ${cy - 20} Q${cx - 74} ${cy + 66} ${cx - 50} ${cy + 74} L${cx + 50} ${cy + 74} Q${cx + 74} ${cy + 66} ${cx + 70} ${cy - 20} Z`,
          fill,
        }),
      );
    case 'long_straight':
      return h(
        'g',
        { transform: t },
        h('path', {
          d: p`M${cx - 68} ${cy - 30} L${cx - 76} ${cy + 130} L${cx + 76} ${cy + 130} L${cx + 68} ${cy - 30} Z`,
          fill,
        }),
      );
    case 'long_wavy':
      return h(
        'g',
        { transform: t },
        h('path', {
          d: p`M${cx - 68} ${cy - 30} Q${cx - 90} ${cy + 30} ${cx - 72} ${cy + 60} Q${cx - 94} ${cy + 100} ${cx - 70} ${cy + 132} L${cx + 70} ${cy + 132} Q${cx + 94} ${cy + 100} ${cx + 72} ${cy + 60} Q${cx + 90} ${cy + 30} ${cx + 68} ${cy - 30} Z`,
          fill,
        }),
      );
    case 'ponytail':
      return h(
        'g',
        { transform: t },
        h('path', {
          d: p`M${cx + 50} ${cy - 40} Q${cx + 92} ${cy - 10} ${cx + 78} ${cy + 70} Q${cx + 62} ${cy + 30} ${cx + 44} ${cy - 10} Z`,
          fill,
        }),
      );
    case 'bun':
      return h('g', { transform: t }, h('circle', { cx, cy: cy - 76, r: 24, fill }));
    default:
      return null;
  }
}

function frontHair(
  style: AvatarConfig['hairStyle'],
  id: string,
  cx: number,
  cy: number,
  face: (typeof FACE)[keyof typeof FACE],
  light: string,
): SvgNode | null {
  const fill = `url(#${id}hair)`;
  switch (style) {
    case 'bald':
      return h('ellipse', {
        cx: cx - 10,
        cy: cy - face.rt + 12,
        rx: 16,
        ry: 7,
        fill: '#FFFFFF',
        opacity: 0.3,
      });
    case 'buzz':
      return h('path', { d: capPath(cx, cy, face, 0.62, -4), fill, opacity: 0.85 });
    case 'short_crop':
      return h(
        'g',
        {},
        h('path', { d: capPath(cx, cy, face, 0.72), fill }),
        strands(cx, cy, light, 3, 26),
      );
    case 'side_part':
      return h(
        'g',
        {},
        h('path', { d: capPath(cx, cy, face, 0.7), fill }),
        h('path', {
          d: p`M${cx - 20} ${cy - face.rt - 4} Q${cx + 40} ${cy - face.rt} ${cx + face.rx + 4} ${cy - 18} Q${cx + 20} ${cy - 30} ${cx - 10} ${cy - 40} Z`,
          fill,
        }),
        strands(cx + 10, cy, light, 4, 30),
      );
    case 'curly_top':
      return h(
        'g',
        {},
        h('path', { d: capPath(cx, cy, face, 0.75), fill }),
        Array.from({ length: 9 }, (_, i) =>
          h('circle', { cx: cx - 48 + i * 12, cy: cy - face.rt - 2 + (i % 2) * 6, r: 13, fill }),
        ),
        Array.from({ length: 6 }, (_, i) =>
          h('path', {
            d: p`M${cx - 36 + i * 14} ${cy - face.rt + 2} a5 5 0 0 1 8 0`,
            stroke: light,
            'stroke-width': 2,
            fill: 'none',
            opacity: 0.6,
          }),
        ),
      );
    case 'afro':
      return h(
        'g',
        {},
        h('path', { d: capPath(cx, cy, face, 0.75, 6), fill }),
        Array.from({ length: 7 }, (_, i) =>
          h('circle', { cx: cx - 42 + i * 14, cy: cy - face.rt + 6 + (i % 2) * 4, r: 10, fill }),
        ),
      );
    case 'bob':
      return h(
        'g',
        {},
        h('path', { d: capPath(cx, cy, face, 0.55, 3), fill }),
        h('path', {
          d: p`M${cx - face.rx - 2} ${cy - 30} Q${cx} ${cy - 50} ${cx + face.rx + 2} ${cy - 30} L${cx + face.rx + 2} ${cy - 20} Q${cx} ${cy - 36} ${cx - face.rx - 2} ${cy - 20} Z`,
          fill,
        }),
        strands(cx, cy, light, 5, 36),
      );
    case 'long_straight':
    case 'long_wavy':
      return h(
        'g',
        {},
        h('path', { d: capPath(cx, cy, face, 0.66, 3), fill }),
        h('path', {
          d: p`M${cx} ${cy - face.rt - 8} Q${cx - 30} ${cy - 40} ${cx - face.rx - 4} ${cy + 10} L${cx - face.rx - 8} ${cy - 20} Z`,
          fill,
        }),
        h('path', {
          d: p`M${cx} ${cy - face.rt - 8} Q${cx + 30} ${cy - 40} ${cx + face.rx + 4} ${cy + 10} L${cx + face.rx + 8} ${cy - 20} Z`,
          fill,
        }),
        strands(cx, cy, light, 4, 30),
      );
    case 'bun':
    case 'ponytail':
      return h(
        'g',
        {},
        h('path', { d: capPath(cx, cy, face, 0.66), fill }),
        strands(cx, cy, light, 4, 32),
      );
    case 'spiky':
      return h(
        'g',
        {},
        h('path', { d: capPath(cx, cy, face, 0.7), fill }),
        h('path', {
          // Uneven, tilted tufts that grow out of the cap (not a crown).
          d: Array.from({ length: 7 }, (_, i) => {
            const x = cx - 48 + i * 16;
            const tip = cy - face.rt - 20 + ((i * 7) % 3) * 5;
            const lean = (i - 3) * 4;
            return p`M${x - 11} ${cy - face.rt + 14} Q${x + lean * 0.3} ${tip + 10} ${x + lean} ${tip} Q${x + 4} ${tip + 12} ${x + 11} ${cy - face.rt + 14} Z`;
          }).join(' '),
          fill,
        }),
      );
  }
}

// ---------- clothes ----------

function outfitDetails(
  outfit: AvatarConfig['outfit'],
  cloth: string,
  shadow: string,
  accent: [string, string],
): SvgNode | null {
  switch (outfit) {
    case 'hoodie':
      return h(
        'g',
        {},
        [-1, 1].map((s) =>
          h('path', {
            d: p`M${CX + s * 10} 214 v26`,
            stroke: '#FFFFFF',
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          }),
        ),
      );
    case 'jacket':
      return h('path', { d: p`M${CX} 214 V262`, stroke: accent[0], 'stroke-width': 3 });
    case 'sweater':
      return h(
        'g',
        {},
        Array.from({ length: 9 }, (_, i) =>
          h('path', {
            d: p`M${32 + i * 24} 262 v-30`,
            stroke: shadow,
            'stroke-width': 1.5,
            opacity: 0.35,
          }),
        ),
      );
    case 'shirt':
      return h(
        'g',
        {},
        [222, 240, 258].map((y) => h('circle', { cx: CX, cy: y, r: 2.2, fill: '#B8BCCB' })),
      );
    case 'denim_jacket':
      return h(
        'g',
        {},
        [-1, 1].map((s) =>
          h('rect', {
            x: CX + s * 34 - 14,
            y: 222,
            width: 28,
            height: 18,
            rx: 3,
            fill: 'none',
            stroke: '#F2C46D',
            'stroke-width': 1.4,
            'stroke-dasharray': '3 2',
          }),
        ),
      );
    default:
      return h('path', {
        d: p`M60 236 Q${CX} 246 196 236`,
        stroke: mix(cloth, '#FFFFFF', 0.25),
        'stroke-width': 2,
        fill: 'none',
        opacity: 0.4,
      });
  }
}

function collarBack(collar: AvatarConfig['collar'], cloth: string, shadow: string): SvgNode | null {
  if (collar !== 'hood') return null;
  return h('path', {
    d: p`M78 204 Q${CX} 160 178 204 Q${CX} 222 78 204 Z`,
    fill: shadow,
    stroke: mix(cloth, '#000000', 0.1),
    'stroke-width': 1,
  });
}

function collarFront(
  collar: AvatarConfig['collar'],
  cloth: string,
  shadow: string,
  skin: string,
  skinShadow: string,
): SvgNode {
  switch (collar) {
    case 'crew':
      return h('path', {
        d: p`M100 198 Q${CX} 216 156 198`,
        stroke: shadow,
        'stroke-width': 5,
        fill: 'none',
        'stroke-linecap': 'round',
      });
    case 'v_neck':
      return h(
        'g',
        {},
        h('path', { d: p`M102 197 L${CX} 230 L154 197 Z`, fill: skin }),
        h('path', {
          d: p`M102 197 L${CX} 230 L154 197`,
          stroke: shadow,
          'stroke-width': 4,
          fill: 'none',
          'stroke-linejoin': 'round',
        }),
        h('path', {
          d: p`M110 200 L${CX} 224`,
          stroke: skinShadow,
          'stroke-width': 2,
          opacity: 0.3,
        }),
      );
    case 'shirt_collar':
      return h(
        'g',
        {},
        [-1, 1].map((s) =>
          h('path', {
            d: p`M${CX} 214 L${CX + s * 26} 194 L${CX + s * 32} 210 L${CX + s * 8} 226 Z`,
            fill: '#FFFFFF',
            stroke: '#C9CCD8',
            'stroke-width': 1.2,
          }),
        ),
      );
    case 'hood':
      return h(
        'g',
        {},
        [-1, 1].map((s) =>
          h('path', {
            d: p`M${CX + s * 22} 204 Q${CX + s * 30} 214 ${CX + s * 26} 230`,
            stroke: shadow,
            'stroke-width': 4,
            fill: 'none',
            'stroke-linecap': 'round',
          }),
        ),
      );
    case 'lapel':
      return h(
        'g',
        {},
        h('path', { d: p`M106 198 L${CX} 236 L150 198 Z`, fill: '#FFFFFF' }),
        [-1, 1].map((s) =>
          h('path', {
            d: p`M${CX + s * 22} 196 L${CX + s * 2} 240 L${CX + s * 14} 262 L${CX + s * 40} 262 L${CX + s * 44} 206 Z`,
            fill: shadow,
            stroke: mix(shadow, '#000000', 0.2),
            'stroke-width': 1,
          }),
        ),
      );
    case 'turtleneck':
      return h(
        'g',
        {},
        h('rect', { x: CX - 23, y: 168, width: 46, height: 40, rx: 12, fill: cloth }),
        [176, 184, 192, 200].map((y) =>
          h('path', {
            d: p`M${CX - 21} ${y} h42`,
            stroke: shadow,
            'stroke-width': 1.4,
            opacity: 0.5,
          }),
        ),
      );
  }
}

// ---------- accessories / marks ----------

function earring(
  kind: AvatarConfig['earrings'],
  x: number,
  y: number,
  s: 1 | -1,
  accent: [string, string],
): SvgNode | null {
  const gold = '#F2C14E';
  switch (kind) {
    case 'studs':
      return h('circle', {
        cx: x,
        cy: y,
        r: 2.6,
        fill: gold,
        stroke: '#C99A2E',
        'stroke-width': 0.8,
      });
    case 'hoops':
      return h('circle', { cx: x, cy: y + 5, r: 6, fill: 'none', stroke: gold, 'stroke-width': 2 });
    case 'drops':
      return h(
        'g',
        {},
        h('path', { d: p`M${x} ${y} v6`, stroke: gold, 'stroke-width': 1.4 }),
        h('path', { d: p`M${x} ${y + 6} q-4 6 0 9 q4 -3 0 -9 z`, fill: accent[0] }),
      );
    case 'stars':
      return h('path', { d: star(x, y + 3, 4.5, 2), fill: gold });
    case 'cuff':
      return h('path', {
        d: p`M${x + s * 3} ${y - 18} a6 6 0 0 1 ${s * 2} 8`,
        stroke: '#C9CED8',
        'stroke-width': 2.4,
        fill: 'none',
      });
    default:
      return null;
  }
}

function glasses(
  kind: AvatarConfig['glasses'],
  fx: number,
  ey: number,
  accent: [string, string],
): SvgNode | null {
  if (kind === 'none') return null;
  const frame = kind === 'cat_eye' ? accent[1] : '#2E2A35';
  const lens = (s: 1 | -1): SvgNode => {
    const x = fx + s * 25;
    switch (kind) {
      case 'round':
        return h('circle', {
          cx: x,
          cy: ey,
          r: 17,
          fill: '#BFE3FF',
          'fill-opacity': 0.15,
          stroke: frame,
          'stroke-width': 2.6,
        });
      case 'square':
        return h('rect', {
          x: x - 18,
          y: ey - 14,
          width: 36,
          height: 28,
          rx: 6,
          fill: '#BFE3FF',
          'fill-opacity': 0.15,
          stroke: frame,
          'stroke-width': 3,
        });
      case 'cat_eye':
        return h('path', {
          d: p`M${x - s * 18} ${ey - 4} Q${x - s * 16} ${ey + 14} ${x} ${ey + 13} Q${x + s * 17} ${ey + 12} ${x + s * 19} ${ey - 12} Q${x} ${ey - 14} ${x - s * 18} ${ey - 4} Z`,
          fill: '#FFD9E8',
          'fill-opacity': 0.15,
          stroke: frame,
          'stroke-width': 3,
        });
      case 'half_rim':
        return h('path', {
          d: p`M${x - 18} ${ey - 9} Q${x} ${ey - 14} ${x + 18} ${ey - 9}`,
          stroke: frame,
          'stroke-width': 3.2,
          fill: 'none',
          'stroke-linecap': 'round',
        });
      case 'sunglasses':
        return h(
          'g',
          {},
          h('rect', {
            x: x - 19,
            y: ey - 13,
            width: 38,
            height: 26,
            rx: 11,
            fill: '#1E1B26',
            stroke: '#111',
            'stroke-width': 2,
          }),
          h('path', {
            d: p`M${x - 11} ${ey - 6} l8 -4`,
            stroke: '#FFFFFF',
            'stroke-width': 2.4,
            opacity: 0.5,
            'stroke-linecap': 'round',
          }),
        );
      default:
        return h('g', {});
    }
  };
  return h(
    'g',
    {},
    lens(-1),
    lens(1),
    h('path', {
      d: p`M${fx - 8} ${ey - 3} Q${fx} ${ey - 7} ${fx + 8} ${ey - 3}`,
      stroke: frame,
      'stroke-width': 2.4,
      fill: 'none',
    }),
  );
}

function marks(
  kind: AvatarConfig['marks'],
  fx: number,
  fy: number,
  shadow: string,
  accent: [string, string],
): SvgNode | null {
  switch (kind) {
    case 'freckles':
      return h(
        'g',
        { fill: shadow, opacity: 0.7 },
        [
          [-30, 22],
          [-24, 26],
          [-36, 27],
          [-27, 31],
          [30, 22],
          [24, 26],
          [36, 27],
          [27, 31],
          [-6, 20],
          [5, 21],
        ].map(([dx, dy]) => h('circle', { cx: fx + dx!, cy: fy + dy!, r: 1.4 })),
      );
    case 'mole':
      return h('circle', { cx: fx + 18, cy: fy + 50, r: 2, fill: '#5B3A2A' });
    case 'beauty_mark':
      return h('circle', { cx: fx - 34, cy: fy + 14, r: 1.8, fill: '#3E2A22' });
    case 'star_sticker':
      return h('path', {
        d: star(fx + 38, fy + 30, 6, 2.6),
        fill: accent[0],
        stroke: '#FFFFFF',
        'stroke-width': 1,
      });
    default:
      return null;
  }
}

function facialHair(
  kind: AvatarConfig['facialHair'],
  fx: number,
  fy: number,
  hair: string,
  layer: 'under' | 'over',
): SvgNode | null {
  const y = fy + 45;
  if (layer === 'under') {
    switch (kind) {
      case 'stubble':
        return h('path', {
          d: p`M${fx - 46} ${fy + 22} Q${fx - 40} ${fy + 66} ${fx} ${fy + 66} Q${fx + 40} ${fy + 66} ${fx + 46} ${fy + 22} Q${fx} ${fy + 52} ${fx - 46} ${fy + 22} Z`,
          fill: hair,
          opacity: 0.22,
        });
      case 'short_beard':
        return h('path', {
          d: p`M${fx - 50} ${fy + 14} Q${fx - 46} ${fy + 70} ${fx} ${fy + 70} Q${fx + 46} ${fy + 70} ${fx + 50} ${fy + 14} Q${fx + 30} ${fy + 44} ${fx} ${fy + 40} Q${fx - 30} ${fy + 44} ${fx - 50} ${fy + 14} Z`,
          fill: hair,
          opacity: 0.85,
        });
      case 'full_beard':
        return h('path', {
          d: p`M${fx - 54} ${fy + 4} Q${fx - 52} ${fy + 84} ${fx} ${fy + 86} Q${fx + 52} ${fy + 84} ${fx + 54} ${fy + 4} Q${fx + 30} ${fy + 42} ${fx} ${fy + 38} Q${fx - 30} ${fy + 42} ${fx - 54} ${fy + 4} Z`,
          fill: hair,
        });
      case 'goatee':
        return h('path', {
          d: p`M${fx - 12} ${y + 10} Q${fx} ${y + 30} ${fx + 12} ${y + 10} Q${fx} ${y + 16} ${fx - 12} ${y + 10} Z`,
          fill: hair,
        });
      default:
        return null;
    }
  }
  if (kind === 'mustache' || kind === 'goatee' || kind === 'full_beard' || kind === 'short_beard') {
    return h('path', {
      d: p`M${fx - 16} ${y - 4} Q${fx - 8} ${y - 12} ${fx} ${y - 8} Q${fx + 8} ${y - 12} ${fx + 16} ${y - 4} Q${fx} ${y - 6} ${fx - 16} ${y - 4} Z`,
      fill: hair,
    });
  }
  return null;
}

// ---------- hands ----------

function handShape(
  shape: HandPose['shape'],
  skin: string,
  shadow: string,
  skinFill: string,
): SvgNode {
  const st = { stroke: shadow, 'stroke-width': 1.4 };
  const finger = (x: number, y: number, len: number, rot = 0) =>
    h('rect', {
      x: x - 3.6,
      y: y - len,
      width: 7.2,
      height: len + 4,
      rx: 3.6,
      fill: skinFill,
      ...st,
      transform: rot ? `rotate(${rot} ${x} ${y})` : undefined,
    });
  const fist = h('rect', { x: -14, y: -12, width: 28, height: 26, rx: 10, fill: skinFill, ...st });
  const knuckles = h('path', {
    d: 'M-8 -10 v6 M0 -11 v6 M8 -10 v6',
    stroke: shadow,
    'stroke-width': 1.2,
    opacity: 0.6,
  });
  switch (shape) {
    case 'fist':
      return h('g', {}, fist, knuckles);
    case 'thumbs_up':
      return h(
        'g',
        {},
        fist,
        knuckles,
        h('rect', { x: -6, y: -34, width: 10, height: 26, rx: 5, fill: skinFill, ...st }),
      );
    case 'peace':
      return h('g', {}, fist, finger(-4, -10, 24, -10), finger(5, -10, 24, 10));
    case 'point':
    case 'point_up':
      return h('g', {}, fist, finger(-2, -10, 24));
    case 'flat':
      return h(
        'g',
        {},
        h('rect', { x: -11, y: -30, width: 22, height: 44, rx: 10, fill: skinFill, ...st }),
        h('path', { d: 'M-4 -28 v18 M3 -28 v18', stroke: shadow, 'stroke-width': 1, opacity: 0.5 }),
      );
    case 'palm_face':
      return h(
        'g',
        {},
        h('rect', { x: -22, y: -18, width: 44, height: 34, rx: 14, fill: skinFill, ...st }),
        [-15, -5, 5, 15].map((x) => finger(x, -16, 18)),
      );
    case 'heart_left':
    case 'heart_right': {
      const s = shape === 'heart_left' ? -1 : 1;
      return h('path', {
        d: p`M0 16 C${s * 10} 6 ${s * 22} -2 ${s * 16} -14 C${s * 12} -22 ${s * 2} -20 0 -10`,
        stroke: skinFill,
        'stroke-width': 9,
        fill: 'none',
        'stroke-linecap': 'round',
      });
    }
    default:
      return h(
        'g',
        {},
        h('ellipse', { cx: 0, cy: 2, rx: 15, ry: 14, fill: skinFill, ...st }),
        [-10, -3.5, 3.5, 10].map((x, i) =>
          finger(x, -8, 15 + (i === 1 || i === 2 ? 3 : 0), (x / 10) * 8),
        ),
        finger(-15, 4, 10, -50),
      );
  }
  void skin;
}

function arm(
  hand: HandPose | null,
  side: 1 | -1,
  cloth: string,
  skin: string,
  shadow: string,
  id: string,
): SvgNode | null {
  if (!hand || hand.y > 290) return null;
  const sx = CX + side * 86;
  const sy = 262;
  const scale = hand.scale ?? 1;
  // Forearm from below the frame to the wrist, in the outfit colour.
  const wristX = hand.x + side * 4;
  const wristY = hand.y + 16;
  return h(
    'g',
    {},
    h('path', {
      d: p`M${sx} ${sy + 20} Q${(sx + wristX) / 2 + side * 14} ${(sy + wristY) / 2 + 10} ${wristX} ${wristY}`,
      stroke: cloth,
      'stroke-width': 24,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    h('path', {
      d: p`M${wristX - 10} ${wristY + 2} l20 0`,
      stroke: mix(cloth, '#000000', 0.15),
      'stroke-width': 5,
      'stroke-linecap': 'round',
    }),
    h(
      'g',
      {
        transform: `translate(${hand.x.toFixed(2)} ${hand.y.toFixed(2)}) rotate(${hand.rot.toFixed(2)}) scale(${scale.toFixed(3)})`,
      },
      handShape(hand.shape, skin, shadow, `url(#${id}skin)`),
    ),
  );
}

// ---------- effects ----------

function star(cx: number, cy: number, r: number, ri: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? ri : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

const heart = (x: number, y: number, s: number) =>
  p`M${x} ${y + s * 0.7} l${-s} ${-s} a${s * 0.5} ${s * 0.5} 0 0 1 ${s} ${-s * 0.45} a${s * 0.5} ${s * 0.5} 0 0 1 ${s} ${s * 0.45} z`;

function faceFx(fx: Set<string>, x: number, y: number, eyeY: number): SvgNode {
  const out: (SvgNode | null)[] = [];
  if (fx.has('tears') || fx.has('tears_small') || fx.has('tears_joy')) {
    const big = fx.has('tears');
    for (const s of [-1, 1]) {
      out.push(
        fx.has('tears_joy')
          ? h('path', {
              d: p`M${x + s * 40} ${eyeY - 2} q${s * 8} -4 ${s * 12} 4 q-4 6 ${-s * 12} -4 z`,
              fill: '#7CC6FF',
            })
          : h('path', {
              d: p`M${x + s * 22} ${eyeY + 10} q${s * 2} ${big ? 24 : 10} ${s * 1} ${big ? 40 : 16}`,
              stroke: '#7CC6FF',
              'stroke-width': big ? 6 : 4,
              fill: 'none',
              'stroke-linecap': 'round',
              opacity: 0.9,
            }),
      );
    }
  }
  if (fx.has('sweat'))
    out.push(
      h('path', {
        d: p`M${x + 50} ${y - 34} q-7 12 0 16 q7 -4 0 -16 z`,
        fill: '#8FD3FF',
        stroke: '#5AB4F0',
        'stroke-width': 1,
      }),
    );
  if (fx.has('anger_mark'))
    out.push(
      h('path', {
        d: p`M${x + 34} ${y - 52} q6 6 0 12 M${x + 46} ${y - 52} q-6 6 0 12 M${x + 34} ${y - 52} q6 -4 12 0 M${x + 34} ${y - 40} q6 4 12 0`,
        stroke: '#E5383B',
        'stroke-width': 3,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
  if (fx.has('green_tint'))
    out.push(h('ellipse', { cx: x, cy: y - 10, rx: 50, ry: 30, fill: '#7BC47F', opacity: 0.25 }));
  if (fx.has('blue_tint'))
    out.push(h('ellipse', { cx: x, cy: y - 20, rx: 54, ry: 34, fill: '#7FA7E8', opacity: 0.25 }));
  return h('g', {}, out);
}

function floatingFx(fx: Set<string>, accent: [string, string]): SvgNode {
  const out: (SvgNode | null)[] = [];
  if (fx.has('zzz'))
    out.push(
      h(
        'g',
        { fill: '#6D5AE6', 'font-family': 'sans-serif', 'font-weight': 700 },
        h('text', { x: 190, y: 62, 'font-size': 24 }, 'Z'),
        h('text', { x: 214, y: 42, 'font-size': 17 }, 'z'),
        h('text', { x: 230, y: 28, 'font-size': 12 }, 'z'),
      ),
    );
  if (fx.has('hearts') || fx.has('heart_small'))
    out.push(
      h(
        'g',
        { fill: '#FF5C8A' },
        h('path', { d: heart(206, 60, 10) }),
        fx.has('hearts') ? h('path', { d: heart(44, 74, 8) }) : null,
        fx.has('hearts') ? h('path', { d: heart(224, 104, 6) }) : null,
      ),
    );
  if (fx.has('broken_heart'))
    out.push(
      h(
        'g',
        {},
        h('path', { d: heart(208, 64, 12), fill: '#FF5C8A' }),
        h('path', {
          d: p`M208 46 l-4 8 l6 6 l-4 8`,
          stroke: '#FFFFFF',
          'stroke-width': 2.5,
          fill: 'none',
        }),
      ),
    );
  if (fx.has('sparkles'))
    out.push(
      h(
        'g',
        { fill: '#FFC93C' },
        h('path', { d: star(50, 52, 9, 3) }),
        h('path', { d: star(212, 44, 7, 2.5) }),
        h('path', { d: star(222, 120, 5, 2) }),
      ),
    );
  if (fx.has('question'))
    out.push(
      h(
        'text',
        {
          x: 200,
          y: 64,
          'font-size': 34,
          'font-weight': 800,
          fill: accent[0],
          'font-family': 'sans-serif',
        },
        '?',
      ),
    );
  if (fx.has('exclamation'))
    out.push(
      h(
        'text',
        {
          x: 204,
          y: 66,
          'font-size': 38,
          'font-weight': 900,
          fill: '#E5383B',
          'font-family': 'sans-serif',
        },
        '!',
      ),
    );
  if (fx.has('music_note'))
    out.push(
      h(
        'text',
        { x: 196, y: 70, 'font-size': 28, fill: accent[0], 'font-family': 'sans-serif' },
        '♪',
      ),
    );
  if (fx.has('rain_cloud'))
    out.push(
      h(
        'g',
        {},
        h('ellipse', { cx: 128, cy: 18, rx: 52, ry: 16, fill: '#8C96A8' }),
        [100, 120, 140, 160].map((x) =>
          h('path', {
            d: p`M${x} 36 l-3 10`,
            stroke: '#7CC6FF',
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          }),
        ),
      ),
    );
  if (fx.has('steam') || fx.has('steam_small'))
    out.push(
      h(
        'g',
        { fill: '#E9ECF2', opacity: 0.9 },
        h('circle', { cx: 52, cy: 54, r: 10 }),
        h('circle', { cx: 40, cy: 42, r: 7 }),
        fx.has('steam') ? h('circle', { cx: 206, cy: 54, r: 10 }) : null,
        fx.has('steam') ? h('circle', { cx: 218, cy: 42, r: 7 }) : null,
      ),
    );
  if (fx.has('stars_orbit'))
    out.push(
      h(
        'g',
        { fill: '#FFC93C' },
        h('path', { d: star(84, 34, 6, 2.5) }),
        h('path', { d: star(128, 22, 6, 2.5) }),
        h('path', { d: star(172, 34, 6, 2.5) }),
      ),
    );
  if (fx.has('shiver'))
    out.push(
      h(
        'g',
        { stroke: '#7FA7E8', 'stroke-width': 2.5, 'stroke-linecap': 'round' },
        h('path', { d: 'M40 100 l-8 4 M40 120 l-10 0 M216 100 l8 4 M216 120 l10 0' }),
      ),
    );
  if (fx.has('heat'))
    out.push(
      h('path', {
        d: 'M40 40 q6 -8 0 -16 M56 44 q6 -8 0 -16 M200 44 q6 -8 0 -16',
        stroke: '#FF8A5B',
        'stroke-width': 3,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
  if (fx.has('thermometer'))
    out.push(
      h(
        'g',
        {},
        h('rect', {
          x: 150,
          y: 140,
          width: 6,
          height: 28,
          rx: 3,
          fill: '#FFFFFF',
          stroke: '#B0B6C4',
          transform: 'rotate(-35 153 154)',
        }),
        h('circle', { cx: 162, cy: 166, r: 4, fill: '#E5383B' }),
      ),
    );
  return h('g', {}, out);
}
