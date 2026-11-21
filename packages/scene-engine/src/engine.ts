import { defaultCatalog, type SceneCatalog } from './catalog/loader';
import {
  parseText,
  splitTag,
  tierFor,
  type ParseResult,
  type SuggestionTier,
} from './parser/parser';
import {
  SceneSchema,
  type CatalogScene,
  type Character,
  type Scene,
  type TimeOfDay,
} from './schema';

export interface EngineOptions {
  /** User's age, or use ageBracket. Unknown age is treated as a minor (romance hidden). */
  age?: number | null;
  ageBracket?: 'teen' | 'adult';
  catalog?: SceneCatalog;
  senderAvatarId?: string;
  recipientAvatarId?: string;
}

export interface SceneSuggestion {
  /** The best scene, or null when confidence < 0.40 (show the picker only). */
  scene: Scene | null;
  tier: SuggestionTier;
  confidence: number;
  /** Top 3 for chips (already age filtered). */
  alternatives: { scene_id: string; confidence: number }[];
  parse: ParseResult;
}

const effectiveAge = (o: EngineOptions) =>
  typeof o.age === 'number'
    ? o.age
    : o.ageBracket === 'adult'
      ? 18
      : o.ageBracket === 'teen'
        ? 13
        : null;

/** Only scenes this user may see. Everything below goes through this. */
export function allowedScenes(opts: EngineOptions = {}): readonly CatalogScene[] {
  return (opts.catalog ?? defaultCatalog()).forAge(effectiveAge(opts));
}

/** Text → scene suggestion. Romantic (18+) scenes never come back for minors. */
export function suggestScene(text: string, opts: EngineOptions = {}): SceneSuggestion {
  const scenes = allowedScenes(opts);
  const parse = parseText(text, scenes);
  const top = parse.candidates[0];
  const entry = top ? scenes.find((s) => s.scene_id === top.scene_id) : undefined;
  const scene = entry && parse.tier !== 'none' ? buildScene(entry, parse, opts) : null;
  return {
    scene,
    tier: parse.tier,
    confidence: parse.confidence,
    alternatives: parse.candidates.map((c) => ({ scene_id: c.scene_id, confidence: c.confidence })),
    parse,
  };
}

/** A scene picked by id (picker / chips). Returns null if the user may not use it. */
export function sceneFromCatalog(
  sceneId: string,
  opts: EngineOptions & { bubbleText?: string | null } = {},
): Scene | null {
  const entry = allowedScenes(opts).find((s) => s.scene_id === sceneId);
  if (!entry) return null;
  return buildScene(entry, null, opts, opts.bubbleText ?? null);
}

// ---------- building ----------

const TIME_WORDS: [string, TimeOfDay][] = [
  ['this morning', 'morning'],
  ['morning', 'morning'],
  ['breakfast', 'morning'],
  ['brunch', 'morning'],
  ['noon', 'afternoon'],
  ['lunch', 'afternoon'],
  ['this afternoon', 'afternoon'],
  ['afternoon', 'afternoon'],
  ['tonight', 'evening'],
  ['this evening', 'evening'],
  ['evening', 'evening'],
  ['dinner', 'evening'],
  ['midnight', 'night'],
  ['night', 'night'],
];

function timeOfDay(entry: CatalogScene, parse: ParseResult | null): TimeOfDay {
  if (parse) {
    const values = parse.entities.filter((e) => !e.negated).map((e) => e.value);
    for (const [w, t] of TIME_WORDS) if (values.includes(w)) return t;
  }
  return entry.time_of_day;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const FIXED_BUBBLES: Record<string, string> = {
  thank_you_bow: 'Thank you!',
  sorry_apology: 'Sorry!',
  on_my_way: 'On my way!',
  running_late: 'Running late!',
  wave_hello: 'Hi!',
  goodbye_wave: 'Bye!',
  good_morning_sun: 'Good morning!',
  good_night_moon: 'Good night!',
  birthday_cake: 'Happy birthday!',
  congrats_confetti: 'Congrats!',
  get_well_soon: 'Get well soon!',
  you_got_this: 'You got this!',
  comfort_hug: "I'm here for you",
  miss_you_friend: 'Miss you!',
  welcome_back: 'Welcome back!',
  how_are_you: 'How are you?',
  stuck_in_traffic: 'Stuck in traffic!',
  christmas_tree: 'Merry Christmas!',
  new_year_fireworks: 'Happy New Year!',
  long_time_no_see: 'Long time no see!',
};

/**
 * Short speech bubble that summarises the message, e.g. "Can we go out for dinner tonight?"
 * → "Dinner tonight?". At most 24 characters.
 */
export function bubbleText(entry: CatalogScene, parse: ParseResult): string {
  const time = parse.entities.find((e) => e.kind === 'time' && !e.negated)?.value;
  const timeLabel =
    time && ['tonight', 'today', 'tomorrow', 'this weekend', 'now', 'later'].includes(time)
      ? time
      : null;
  const mark = parse.isQuestion ? '?' : '!';

  if (entry.scene_id === 'cancel_plans') {
    return timeLabel ? `Not ${timeLabel}, sorry!` : "Can't make it, sorry!";
  }
  const fixed = FIXED_BUBBLES[entry.scene_id];
  if (fixed) return fixed;

  // A concrete thing (food / activity) named in the text that this scene is about.
  const tags = entry.tags.map((t) => splitTag(t).text);
  const thing = parse.entities.find(
    (e) =>
      (e.kind === 'food' || e.kind === 'activity') &&
      !e.negated &&
      tags.some((t) => t === e.value || t.split(' ').includes(e.value)),
  )?.value;
  const matched = parse.candidates.find((c) => c.scene_id === entry.scene_id)?.matched ?? [];
  const main =
    thing ?? matched.filter((m) => !m.includes(' ') || m.length <= 16)[0] ?? matched[0] ?? tags[0]!;
  const text = `${cap(main)}${timeLabel ? ` ${timeLabel}` : ''}${mark}`;
  return text.length <= 24 ? text : `${cap(main).slice(0, 22)}${mark}`;
}

function buildScene(
  entry: CatalogScene,
  parse: ParseResult | null,
  opts: EngineOptions,
  bubbleOverride: string | null = null,
): Scene {
  const people: Character[] = [
    {
      role: 'sender',
      avatar_id: opts.senderAvatarId ?? 'sender_default',
      expression: entry.expression,
      action: entry.action,
    },
  ];
  if (entry.characters === 2) {
    people.push({
      role: 'recipient',
      avatar_id: opts.recipientAvatarId ?? 'recipient_default',
      expression: entry.expression,
      action: entry.action === 'wave' || entry.action === 'talk' ? entry.action : entry.action,
    });
  }
  // Sarcasm or negation tones the faces down rather than showing a party.
  if (parse?.sarcasm.likely) for (const p of people) p.expression = 'neutral';

  const excited = entry.emotion === 'excited' || entry.intensity_levels.includes(3);
  const text = bubbleOverride ?? (parse ? bubbleText(entry, parse) : null);
  const scene: Scene = {
    scene_type: entry.category,
    characters: people,
    setting: {
      place: entry.background,
      time_of_day: timeOfDay(entry, parse),
      background: entry.background,
    },
    props: entry.props,
    emotion: entry.emotion,
    speech_bubble: text ? { text, speaker: 0 } : null,
    effects: entry.effects,
    camera: {
      shot: people.length === 1 ? 'close' : entry.effects.includes('fireworks') ? 'wide' : 'medium',
      angle: 'eye',
      motion: entry.emotion === 'angry' ? 'shake' : excited ? 'zoom_in' : 'static',
    },
    confidence: parse ? parse.confidence : 1,
    catalog_scene_id: entry.scene_id,
  };
  return SceneSchema.parse(scene);
}

export { tierFor };
