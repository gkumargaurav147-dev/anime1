import { z } from 'zod';
import expressionsJson from './expressions.v1.json';
import gesturesJson from './gestures.v1.json';
import type { Emotion, Expression } from '../schema';

// ---------- schemas ----------

const HeadSchema = z.object({ pitch: z.number(), yaw: z.number(), roll: z.number() });
export type HeadPose = z.infer<typeof HeadSchema>;

export const HAND_SHAPES = [
  'open',
  'fist',
  'thumbs_up',
  'peace',
  'point',
  'point_up',
  'heart_left',
  'heart_right',
  'palm_face',
  'flat',
] as const;
const HandSchema = z.object({
  x: z.number(),
  y: z.number(),
  rot: z.number(),
  shape: z.enum(HAND_SHAPES),
  scale: z.number().positive().optional(),
});
export type HandPose = z.infer<typeof HandSchema>;

export const ExpressionDefSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  emotion: z.string(),
  /** Blendshape name â†’ weight 0..1. Missing names are 0. */
  weights: z.record(z.string(), z.number().min(0).max(1)),
  head: HeadSchema,
  /** Overlay effects drawn around the face (tears, blush, zzzâ€¦). */
  fx: z.array(z.string()),
  /** Gesture that suits this expression, if any (played only when asked). */
  gesture: z.string().nullable(),
  /** Mood colour for the background glow. */
  glow: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
export type ExpressionDef = z.infer<typeof ExpressionDefSchema>;

const ExpressionFileSchema = z.object({
  version: z.string(),
  blendshapes: z.array(z.string()),
  intensity: z.record(z.enum(['1', '2', '3']), z.object({ weight: z.number(), speed: z.number() })),
  expressions: z.array(ExpressionDefSchema).min(100),
});

const GestureKeySchema = z.object({
  t: z.number().min(0).max(1),
  left: HandSchema.optional(),
  right: HandSchema.optional(),
  head: HeadSchema.optional(),
  body: z.object({ dy: z.number() }).optional(),
});
export const GestureDefSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  duration_ms: z.number().int().positive(),
  loop: z.boolean(),
  keys: z.array(GestureKeySchema).min(2),
});
export type GestureDef = z.infer<typeof GestureDefSchema>;
const GestureFileSchema = z.object({ version: z.string(), gestures: z.array(GestureDefSchema) });

// ---------- loaded data ----------

const expressionFile = ExpressionFileSchema.parse(expressionsJson);
const gestureFile = GestureFileSchema.parse(gesturesJson);

export const EXPRESSIONS_VERSION = expressionFile.version;
export const GESTURES_VERSION = gestureFile.version;
/** Canonical morph-target names. 3D models must use exactly these (see ASSET_SPEC.md). */
export const BLENDSHAPES: readonly string[] = expressionFile.blendshapes;
export const EXPRESSION_DEFS: readonly ExpressionDef[] = expressionFile.expressions;
export const GESTURES: readonly GestureDef[] = gestureFile.gestures;

const exprById = new Map(EXPRESSION_DEFS.map((e) => [e.id, e]));
const gestureById = new Map(GESTURES.map((g) => [g.id, g]));

export const getExpression = (id: string): ExpressionDef =>
  exprById.get(id) ?? exprById.get('neutral')!;
export const getGesture = (id: string | null | undefined): GestureDef | null =>
  (id && gestureById.get(id)) || null;

// ---------- mappings from the scene engine ----------

/** Default expression for each scene emotion. */
export const EMOTION_TO_EXPRESSION: Record<Emotion, string> = {
  happy: 'smile',
  sad: 'sad',
  angry: 'angry',
  surprised: 'surprised',
  excited: 'excited',
  tired: 'sleepy',
  nervous: 'worried',
  bored: 'bored',
  love: 'in_love',
  grateful: 'grateful',
  sorry: 'sorry',
  confused: 'confused',
  calm: 'calm',
  proud: 'proud',
  scared: 'scared',
  neutral: 'neutral',
};

/** Catalog `expression` values (M3) â†’ expression ids. */
export const SCENE_EXPRESSION_TO_ID: Record<Expression, string> = {
  neutral: 'neutral',
  smile: 'smile',
  grin: 'grin',
  laugh: 'laugh',
  sad: 'sad',
  cry: 'cry',
  angry: 'angry',
  surprised: 'surprised',
  sleepy: 'sleepy',
  nervous: 'nervous_smile',
  love: 'heart_eyes',
  wink: 'wink',
  confused: 'confused',
  determined: 'determined',
};

/** Named moods from the product brief â†’ expression ids (shy, shocked, smirk, â€¦). */
export const MOOD_TO_EXPRESSION: Record<string, string> = {
  smile: 'smile',
  grin: 'grin',
  wink: 'wink',
  squint: 'giggle',
  scrunch: 'cringe',
  laugh: 'laugh',
  cry: 'cry',
  angry: 'angry',
  shy: 'shy',
  shocked: 'shocked',
  sleepy: 'sleepy',
  worried: 'worried',
  confused: 'confused',
  smirk: 'smirk',
  happy: 'smile',
  love: 'in_love',
  sad: 'sad',
  bored: 'bored',
};

/** Weight and speed multipliers for intensity 1â€“3. */
export function intensityScale(level: 1 | 2 | 3) {
  return expressionFile.intensity[String(level) as '1' | '2' | '3'] ?? { weight: 1, speed: 1 };
}

/** Expression weights after intensity scaling. */
export function scaledWeights(expr: ExpressionDef, level: 1 | 2 | 3): Record<string, number> {
  const { weight } = intensityScale(level);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(expr.weights)) out[k] = Math.min(1, v * weight);
  return out;
}
