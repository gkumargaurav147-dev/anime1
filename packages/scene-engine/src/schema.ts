import { z } from 'zod';

/** Catalog categories (also used as `scene_type`). */
export const CATEGORIES = [
  'emotions',
  'greetings',
  'food_and_drink',
  'travel',
  'movies_and_fun',
  'date_and_romance',
  'friends',
  'family',
  'celebration',
  'work_and_study',
  'daily_life',
  'support',
  'seasonal',
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const EMOTIONS = [
  'happy',
  'sad',
  'angry',
  'surprised',
  'excited',
  'tired',
  'nervous',
  'bored',
  'love',
  'grateful',
  'sorry',
  'confused',
  'calm',
  'proud',
  'scared',
  'neutral',
] as const;
export const EmotionSchema = z.enum(EMOTIONS);
export type Emotion = z.infer<typeof EmotionSchema>;

export const EXPRESSIONS = [
  'neutral',
  'smile',
  'grin',
  'laugh',
  'sad',
  'cry',
  'angry',
  'surprised',
  'sleepy',
  'nervous',
  'love',
  'wink',
  'confused',
  'determined',
] as const;
export const ExpressionSchema = z.enum(EXPRESSIONS);
export type Expression = z.infer<typeof ExpressionSchema>;

export const ACTIONS = [
  'idle',
  'wave',
  'talk',
  'sit',
  'eat',
  'drink',
  'walk',
  'run',
  'dance',
  'jump',
  'hug',
  'cheer',
  'sleep',
  'work',
  'read',
  'bow',
  'point',
  'drive',
  'think',
] as const;
export const ActionSchema = z.enum(ACTIONS);
export type Action = z.infer<typeof ActionSchema>;

export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night', 'any'] as const;
export const TimeOfDaySchema = z.enum(TIMES_OF_DAY);
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

const slug = z.string().regex(/^[a-z0-9_]+$/, 'lowercase snake_case');

export const CharacterSchema = z.object({
  role: z.enum(['sender', 'recipient', 'friend', 'crowd']),
  avatar_id: z.string().min(1),
  expression: ExpressionSchema,
  action: ActionSchema,
});
export type Character = z.infer<typeof CharacterSchema>;

export const MAX_AVATARS = 500;

/** The scene description produced by the engine and consumed by the composer / renderer. */
export const SceneSchema = z.object({
  scene_type: CategorySchema,
  characters: z.array(CharacterSchema).min(1).max(MAX_AVATARS),
  setting: z.object({
    place: slug,
    time_of_day: TimeOfDaySchema,
    background: slug,
  }),
  props: z.array(slug).max(20),
  emotion: EmotionSchema,
  speech_bubble: z
    .object({
      text: z.string().min(1).max(40),
      /** Index into `characters` of who is speaking. */
      speaker: z.number().int().min(0),
    })
    .nullable(),
  effects: z.array(slug).max(10),
  camera: z.object({
    shot: z.enum(['wide', 'medium', 'close']),
    angle: z.enum(['eye', 'low', 'high']),
    motion: z.enum(['static', 'pan', 'zoom_in', 'shake']),
  }),
  confidence: z.number().min(0).max(1),
  catalog_scene_id: slug.nullable(),
});
export type Scene = z.infer<typeof SceneSchema>;

// ----- Catalog -----

export const CatalogSceneSchema = z.object({
  scene_id: slug,
  category: CategorySchema,
  /** Words/phrases that point at this scene. Multi-word phrases count more. */
  tags: z.array(z.string().min(1)).min(1),
  emotion: EmotionSchema,
  props: z.array(slug),
  /** Background asset id; also used as the setting place. */
  background: slug,
  effects: z.array(slug),
  characters: z.union([z.literal(1), z.literal(2)]),
  duration_ms: z.number().int().min(500).max(15_000),
  intensity_levels: z.array(z.number().int().min(1).max(5)).min(1),
  /** 0 = everyone (the app itself is 13+), 18 = adults only. */
  min_age: z.union([z.literal(0), z.literal(13), z.literal(18)]),
  premium: z.boolean(),
  /** Intents this scene fits (boosts matching). */
  intents: z.array(z.string()).default([]),
  /** Default time of day for the setting when the text doesn't say. */
  time_of_day: TimeOfDaySchema.default('any'),
  /** Default expression/action for the characters. */
  expression: ExpressionSchema.default('smile'),
  action: ActionSchema.default('idle'),
});
export type CatalogScene = z.infer<typeof CatalogSceneSchema>;

export const CatalogSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    scenes: z.array(CatalogSceneSchema),
  })
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    for (const [i, s] of c.scenes.entries()) {
      if (seen.has(s.scene_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['scenes', i, 'scene_id'],
          message: `duplicate ${s.scene_id}`,
        });
      }
      seen.add(s.scene_id);
    }
  });
export type Catalog = z.infer<typeof CatalogSchema>;
