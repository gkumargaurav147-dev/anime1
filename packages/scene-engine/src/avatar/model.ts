import { z } from 'zod';

/**
 * Avatar data model. A user's avatar is a small JSON of option ids (no photos, no face data).
 * Everything that draws an avatar — SVG bust, 3D bust, scene composer — reads only this, so
 * the same avatar_id looks the same everywhere.
 */

export const AVATAR_MODEL_VERSION = 1;

export const AVATAR_OPTIONS = {
  faceShape: ['round', 'oval', 'soft_square', 'heart', 'long', 'wide'],
  skinTone: [
    'porcelain',
    'ivory',
    'sand',
    'honey',
    'golden',
    'tan',
    'caramel',
    'bronze',
    'cocoa',
    'espresso',
  ],
  eyeShape: ['round', 'almond', 'droopy', 'upturned', 'wide', 'narrow'],
  eyeColor: ['dark_brown', 'brown', 'hazel', 'amber', 'green', 'blue', 'gray', 'violet'],
  eyebrows: ['soft', 'straight', 'arched', 'thick', 'thin', 'angled'],
  nose: ['button', 'small', 'round', 'pointed', 'wide', 'snub'],
  mouth: ['soft', 'full', 'thin', 'wide', 'small', 'heart'],
  hairStyle: [
    'buzz',
    'short_crop',
    'side_part',
    'curly_top',
    'afro',
    'bob',
    'long_straight',
    'long_wavy',
    'bun',
    'ponytail',
    'spiky',
    'bald',
  ],
  hairColor: [
    'black',
    'dark_brown',
    'brown',
    'auburn',
    'blonde',
    'platinum',
    'red',
    'pink',
    'blue',
    'purple',
    'gray',
  ],
  marks: ['none', 'freckles', 'mole', 'rosy_cheeks', 'beauty_mark', 'star_sticker'],
  facialHair: ['none', 'stubble', 'mustache', 'goatee', 'short_beard', 'full_beard'],
  earrings: ['none', 'studs', 'hoops', 'drops', 'stars', 'cuff'],
  glasses: ['none', 'round', 'square', 'cat_eye', 'half_rim', 'sunglasses'],
  outfit: ['tee', 'hoodie', 'jacket', 'sweater', 'shirt', 'denim_jacket'],
  collar: ['crew', 'v_neck', 'shirt_collar', 'hood', 'lapel', 'turtleneck'],
  accentColor: ['violet', 'coral', 'teal', 'sunflower', 'sky', 'rose', 'mint', 'tangerine'],
} as const;

export type AvatarPart = keyof typeof AVATAR_OPTIONS;
export const AVATAR_PARTS = Object.keys(AVATAR_OPTIONS) as AvatarPart[];

const opt = <K extends AvatarPart>(k: K) =>
  z.enum(
    AVATAR_OPTIONS[k] as unknown as [
      (typeof AVATAR_OPTIONS)[K][number],
      ...(typeof AVATAR_OPTIONS)[K][number][],
    ],
  );

export const AvatarConfigSchema = z
  .object({
    version: z.literal(AVATAR_MODEL_VERSION),
    faceShape: opt('faceShape'),
    skinTone: opt('skinTone'),
    eyeShape: opt('eyeShape'),
    eyeColor: opt('eyeColor'),
    eyebrows: opt('eyebrows'),
    nose: opt('nose'),
    mouth: opt('mouth'),
    hairStyle: opt('hairStyle'),
    hairColor: opt('hairColor'),
    marks: opt('marks'),
    facialHair: opt('facialHair'),
    earrings: opt('earrings'),
    glasses: opt('glasses'),
    outfit: opt('outfit'),
    collar: opt('collar'),
    accentColor: opt('accentColor'),
  })
  .strict();
export type AvatarConfig = z.infer<typeof AvatarConfigSchema>;

// ---------- palettes (original; tuned for soft cartoon shading) ----------

/** [base, shadow, highlight] per tone. */
export const SKIN_PALETTE: Record<AvatarConfig['skinTone'], [string, string, string]> = {
  porcelain: ['#FBE3D6', '#E9BFAE', '#FFF4EE'],
  ivory: ['#F6D7BF', '#E2B396', '#FFEBDD'],
  sand: ['#EEC6A0', '#D5A27A', '#FADCC0'],
  honey: ['#E2AE7E', '#C58B5C', '#F2C79E'],
  golden: ['#D9A066', '#B97E47', '#ECBB86'],
  tan: ['#C68A58', '#A56B3E', '#DBA676'],
  caramel: ['#B0743F', '#8E5829', '#C88E5A'],
  bronze: ['#9A6136', '#784621', '#B37A4D'],
  cocoa: ['#7A4A2A', '#5B3319', '#946240'],
  espresso: ['#5A3520', '#3F2213', '#734A31'],
};

export const EYE_PALETTE: Record<AvatarConfig['eyeColor'], [string, string]> = {
  dark_brown: ['#4A2C1A', '#22120A'],
  brown: ['#7A4B26', '#3E220F'],
  hazel: ['#8D6B2F', '#4C3815'],
  amber: ['#C88A1E', '#6E470A'],
  green: ['#4E8A4B', '#244A22'],
  blue: ['#3E7FC4', '#1B4072'],
  gray: ['#7D8A96', '#414C57'],
  violet: ['#7D5BC4', '#3F2A75'],
};

/** [base, shadow, highlight] per hair colour. */
export const HAIR_PALETTE: Record<AvatarConfig['hairColor'], [string, string, string]> = {
  black: ['#2A2730', '#141217', '#4A4652'],
  dark_brown: ['#4B2E1F', '#2D1A10', '#6E4A35'],
  brown: ['#7A4E2D', '#53321B', '#9C6D48'],
  auburn: ['#9A3F22', '#6B2713', '#C2603C'],
  blonde: ['#E3BC6B', '#B98F42', '#F6DB9C'],
  platinum: ['#E9E3D8', '#BFB6A6', '#FFFFFF'],
  red: ['#C9372C', '#8E1F18', '#EC6A5E'],
  pink: ['#F08DB5', '#C25E88', '#FFC0DA'],
  blue: ['#4D7CE0', '#2A4FA6', '#86A8F2'],
  purple: ['#8A5BD6', '#5B36A0', '#B48CF0'],
  gray: ['#A7A3A0', '#77736F', '#CFCBC8'],
};

export const ACCENT_PALETTE: Record<AvatarConfig['accentColor'], [string, string]> = {
  violet: ['#6D5AE6', '#4B3BB8'],
  coral: ['#FF7A6B', '#D9544A'],
  teal: ['#2BB3A3', '#18847A'],
  sunflower: ['#F5C33B', '#C99A1A'],
  sky: ['#4FA8F2', '#2B7BC4'],
  rose: ['#E85D8E', '#B83C68'],
  mint: ['#5CCB95', '#35A06E'],
  tangerine: ['#FF9B3D', '#D8761C'],
};

// ---------- deterministic defaults ----------

/** FNV-1a 32-bit. Stable across platforms. */
export function hash32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rarer extras so random avatars don't all wear glasses and earrings. */
const SPARSE: Partial<Record<AvatarPart, number>> = {
  marks: 0.45,
  facialHair: 0.3,
  earrings: 0.4,
  glasses: 0.3,
};

/** A random but reproducible avatar: same seed → same avatar. */
export function randomAvatar(seed: string | number): AvatarConfig {
  const base = String(seed);
  // Each part gets its own hashed stream, so similar seeds still give unrelated avatars.
  const pick = <K extends AvatarPart>(k: K): (typeof AVATAR_OPTIONS)[K][number] => {
    const rnd = prng(hash32(`${base}#${k}`));
    rnd();
    const list = AVATAR_OPTIONS[k];
    const sparse = SPARSE[k];
    if (sparse !== undefined && rnd() > sparse)
      return list[0] as (typeof AVATAR_OPTIONS)[K][number];
    return list[Math.floor(rnd() * list.length)] as (typeof AVATAR_OPTIONS)[K][number];
  };
  const config = { version: AVATAR_MODEL_VERSION } as Record<string, unknown>;
  for (const part of AVATAR_PARTS) config[part] = pick(part);
  return AvatarConfigSchema.parse(config);
}

/**
 * Resolves avatar_id → config. Saved avatars come from the directory; anything else (e.g.
 * 'sender_default' in a catalog scene) gets a deterministic avatar derived from the id, so it
 * still looks the same in every scene.
 */
export class AvatarDirectory {
  private readonly saved = new Map<string, AvatarConfig>();

  set(avatarId: string, config: AvatarConfig) {
    this.saved.set(avatarId, AvatarConfigSchema.parse(config));
  }

  get(avatarId: string): AvatarConfig {
    return this.saved.get(avatarId) ?? randomAvatar(`avatar:${avatarId}`);
  }
}

/** Stable fingerprint of a config (for caching rendered layers). */
export const avatarKey = (c: AvatarConfig) => AVATAR_PARTS.map((p) => c[p]).join('|');
