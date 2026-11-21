import type { CatalogScene } from '../schema';
import {
  ANNOUNCE_STARTS,
  ATTENDANCE_WORDS,
  ENTITY_LEXICON,
  INTENT_PATTERNS,
  IRONIC_POSITIVES,
  NEGATION_SCOPE,
  NEGATIVE_CONTEXT,
  NEGATIVE_EMOTION_WORDS,
  NEGATORS,
  POSITIVE_EMOTION_WORDS,
  QUESTION_STARTS,
  SARCASM_EMOJI,
  SARCASM_MARKERS,
  SCOPE_BREAKERS,
  type EntityKind,
  type Intent,
} from './lexicon';
import { normalize, normalizeTag, tokenize } from './normalize';

// ---------- thresholds (spec) ----------

export const AUTO_SUGGEST_AT = 0.75;
export const CHIPS_AT = 0.4;
export type SuggestionTier = 'auto' | 'chips' | 'none';
export const tierFor = (confidence: number): SuggestionTier =>
  confidence >= AUTO_SUGGEST_AT ? 'auto' : confidence >= CHIPS_AT ? 'chips' : 'none';

// ---------- types ----------

export interface Entity {
  kind: EntityKind;
  value: string;
  negated: boolean;
}

export interface Candidate {
  scene_id: string;
  score: number;
  confidence: number;
  matched: string[];
}

export interface ParseResult {
  text: string;
  normalized: string;
  intent: Intent | null;
  intents: Intent[];
  isQuestion: boolean;
  entities: Entity[];
  negation: { present: boolean; negatedTerms: string[] };
  sarcasm: { likely: boolean; cues: string[] };
  /** Best first; at most 3. */
  candidates: Candidate[];
  confidence: number;
  tier: SuggestionTier;
}

// ---------- phrase matching ----------

interface Phrase {
  words: string[];
  re: RegExp;
}

/** Catalog tags may carry a weight suffix: "pregnant^2" counts double. */
export function splitTag(tag: string): { text: string; boost: number } {
  const m = /^(.*)\^(\d+(?:\.\d+)?)$/.exec(tag);
  return m ? { text: m[1]!, boost: Number(m[2]) } : { text: tag, boost: 1 };
}

/**
 * Words that show up in many messages without saying much about the scene. They still count,
 * just less, so a specific word ("boba", "camping") beats them.
 */
const GENERIC_WEIGHT: Record<string, number> = {
  later: 0.5,
  run: 0.5,
  running: 0.6,
  play: 0.5,
  weekend: 0.5,
  morning: 0.5,
  coming: 0.7,
  game: 0.6,
  games: 0.6,
  show: 0.5,
  cookies: 0.6,
  cold: 0.5,
  class: 0.6,
  call: 0.7,
  walk: 0.7,
  happy: 0.6,
  omg: 0.6,
  wow: 0.6,
  cake: 0.6,
  test: 0.7,
  late: 0.7,
  dinner: 0.8,
  lunch: 0.8,
  trip: 0.7,
  sea: 0.6,
  down: 0.6,
  lost: 0.6,
  fall: 0.6,
  present: 0.6,
  drive: 0.7,
  fun: 0.6,
  tour: 0.8,
  sat: 0.4,
  ty: 0.7,
  gm: 0.8,
  gn: 0.8,
  mic: 0.6,
  slice: 0.6,
  line: 0.5,
  fair: 0.6,
  welcome: 0.7,
  there: 0.5,
  clean: 0.7,
  home: 0.6,
  at_home: 0.8,
};

/** Emotion words that mostly colour another subject ("so excited for dinner"). */
const MODIFIER_TAGS = new Set([
  'can not wait',
  'so excited',
  'excited',
  'omg',
  'wow',
  'happy',
  'yay',
  'so happy',
  'lol',
  'haha',
  'looking forward',
  'hyped',
  'nervous',
  'stressed',
  'tired',
  'so tired',
]);

const GREETING_WORDS = new Set(['hi', 'hello', 'hey', 'yo', 'sup', 'hiya', 'howdy']);

const phraseCache = new Map<string, Phrase>();
function phrase(raw: string): Phrase {
  let p = phraseCache.get(raw);
  if (!p) {
    const norm = normalizeTag(raw);
    const words = norm.split(' ');
    const body = words.map((w) => w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join(' ');
    // Allow a plural/verb "s"/"es" on the last word.
    p = { words, re: new RegExp(`(?:^| )${body}(?:s|es)?(?= |$)`, 'g') };
    phraseCache.set(raw, p);
  }
  return p;
}

/** Token spans [start, end) where `raw` occurs in the tokenised text. */
function findSpans(tokens: string[], joined: string, raw: string): [number, number][] {
  const p = phrase(raw);
  const out: [number, number][] = [];
  p.re.lastIndex = 0;
  for (let m = p.re.exec(joined); m; m = p.re.exec(joined)) {
    const charStart = m.index + (m[0].startsWith(' ') ? 1 : 0);
    const start = joined.slice(0, charStart).split(' ').filter(Boolean).length;
    out.push([start, start + p.words.length]);
  }
  void tokens;
  return out;
}

const has = (joined: string, raw: string) => {
  const p = phrase(raw);
  p.re.lastIndex = 0;
  return p.re.test(joined);
};

// ---------- negation ----------

/** Negator words inside these idioms don't negate what follows. */
const NEG_IDIOMS = [
  'can not wait',
  'no worries',
  'no problem',
  'not bad',
  'no way',
  'do not worry',
  'never mind',
  'why not',
  'not going to lie',
  'no idea',
  'not sure',
  'nothing to do',
  'no school',
  'no work',
  'not alone',
  'can not stop',
  'did not see that coming',
  'can not believe',
  'no matter',
];

function negationScopes(tokens: string[], joined: string, protectedIdx: Set<number>) {
  for (const idiom of NEG_IDIOMS) {
    for (const [s, e] of findSpans(tokens, joined, idiom))
      for (let i = s; i < e; i++) protectedIdx.add(i);
  }
  const negated = new Set<number>();
  tokens.forEach((t, i) => {
    if (!NEGATORS.has(t) || protectedIdx.has(i)) return;
    for (let j = i + 1; j < tokens.length && j <= i + NEGATION_SCOPE; j++) {
      if (SCOPE_BREAKERS.has(tokens[j]!)) break;
      negated.add(j);
    }
  });
  return negated;
}

// ---------- sarcasm ----------

const STRONG_SARCASM = new Set([
  'yeah right',
  'said no one ever',
  'said nobody ever',
  '/s',
  'sure jan',
  'love that for me',
  'thanks for nothing',
  'what a time to be alive',
  'oh joy',
  'living the dream',
  'could this day get any better',
  'because that is what i needed',
  'exactly what i needed',
  'cool cool cool',
]);

function detectSarcasm(raw: string, joined: string): { likely: boolean; cues: string[] } {
  const cues: string[] = [];
  if (SARCASM_EMOJI.test(raw)) cues.push('eye-roll emoji');
  let strong = cues.length;
  let weak = 0;
  for (const m of SARCASM_MARKERS) {
    if (!has(joined, m)) continue;
    cues.push(m);
    if (STRONG_SARCASM.has(m)) strong++;
    else weak++;
  }
  const negContext = NEGATIVE_CONTEXT.filter((w) => has(joined, w));
  const ironic = IRONIC_POSITIVES.filter((w) => has(joined, w));
  if (negContext.length && (weak || ironic.length)) {
    cues.push(`positive words with ${negContext.slice(0, 2).join('/')}`);
    strong++;
  }
  // "great." / "perfect." standing alone after a complaint.
  if (
    /(^|[.!] )(great|perfect|wonderful|fantastic|awesome) ?[.!]/.test(joined) &&
    negContext.length
  ) {
    cues.push('one-word ironic reply');
    strong++;
  }
  return { likely: strong > 0, cues };
}

// ---------- intents / question ----------

function detectQuestion(tokens: string[], joined: string) {
  if (tokens.includes('?')) return true;
  const first = tokens[0] ?? '';
  return QUESTION_STARTS.includes(first) && tokens.length > 2 && !joined.startsWith('i ');
}

function detectIntents(joined: string, tokens: string[], isQuestion: boolean): Intent[] {
  const found: Intent[] = [];
  const score: Partial<Record<Intent, number>> = {};
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS) as [Intent, string[]][]) {
    for (const p of patterns) {
      if (!has(joined, p)) continue;
      // Greetings count only near the start ("hey" in the middle is not a greeting).
      if (intent === 'greet') {
        const at = findSpans(tokens, joined, p)[0]?.[0] ?? 99;
        if (
          at > 1 &&
          ![
            'happy birthday',
            'merry christmas',
            'happy new year',
            'congrats',
            'congratulations',
            'welcome',
            'see you',
            'good night',
            'take care',
            'bye',
          ].includes(p)
        )
          continue;
      }
      score[intent] = (score[intent] ?? 0) + phrase(p).words.length;
    }
  }
  // Invitations are questions or proposals; "I want to sleep" is not an invite.
  if (
    score.invite &&
    !isQuestion &&
    !/^(let us|we should|come|join|meet|how about|what about)\b/.test(joined) &&
    !has(joined, 'let us') &&
    !has(joined, 'we should')
  ) {
    score.invite = score.invite * 0.4;
  }
  if (isQuestion && !score.invite) score.ask = 1;
  if (!isQuestion && ANNOUNCE_STARTS.some((s) => joined.startsWith(s + ' ') || joined === s)) {
    score.announce = 0.8;
  }
  for (const [intent, s] of Object.entries(score) as [Intent, number][])
    if (s > 0) found.push(intent);
  found.sort((a, b) => (score[b] ?? 0) - (score[a] ?? 0));
  return found;
}

// ---------- entities ----------

function detectEntities(tokens: string[], joined: string, negated: Set<number>): Entity[] {
  const out: Entity[] = [];
  for (const kind of Object.keys(ENTITY_LEXICON) as EntityKind[]) {
    const seen = new Set<string>();
    // Longest first so "bubble tea" wins over "tea".
    const words = [...ENTITY_LEXICON[kind]].sort((a, b) => b.length - a.length);
    const taken = new Set<number>();
    for (const w of words) {
      for (const [s, e] of findSpans(tokens, joined, w)) {
        if ([...Array(e - s).keys()].some((k) => taken.has(s + k))) continue;
        for (let k = s; k < e; k++) taken.add(k);
        if (seen.has(w)) continue;
        seen.add(w);
        out.push({
          kind,
          value: w,
          negated: [...Array(e - s).keys()].some((k) => negated.has(s + k)),
        });
      }
    }
  }
  return out;
}

// ---------- scoring ----------

interface Match {
  scene: string;
  tag: string;
  start: number;
  end: number;
  weight: number;
  negated: boolean;
}

const tagWeight = (words: number) => 1 + 0.6 * (words - 1);

const sceneCategory = (scenes: readonly CatalogScene[], id: string) =>
  scenes.find((s) => s.scene_id === id)?.category;

/** Negator phrases like "can not wait" are idioms, not negations of a neighbour. */
const isIdiom = (tokens: string[], m: { start: number; end: number }) =>
  NEG_IDIOMS.includes(tokens.slice(m.start, m.end).join(' '));

/**
 * Level 1 parse: rules only, no network, no model. Scores every allowed catalog scene and
 * returns the top three with calibrated confidence.
 */
export function parseText(text: string, scenes: readonly CatalogScene[]): ParseResult {
  const normalized = normalize(text);
  const tokens = tokenize(normalized);
  const joined = tokens.join(' ');
  const isQuestion = detectQuestion(tokens, joined);
  const intents = detectIntents(joined, tokens, isQuestion);
  const intent = intents[0] ?? null;

  // 1. Raw tag matches.
  const matches: Match[] = [];
  for (const s of scenes) {
    for (const rawTag of s.tags) {
      const { text: tag, boost } = splitTag(rawTag);
      for (const [start, end] of findSpans(tokens, joined, tag)) {
        let weight = tagWeight(end - start) * boost * (GENERIC_WEIGHT[tag] ?? 1);
        // "after dinner" / "before lunch" is a time reference, not the plan itself.
        if (['after', 'before'].includes(tokens[start - 1] ?? '')) weight *= 0.3;
        // "hello" in the middle of a sentence is not a greeting ("Nana says hello").
        if (GREETING_WORDS.has(tag) && start > 1) weight *= 0.4;
        matches.push({ scene: s.scene_id, tag, start, end, weight, negated: false });
      }
    }
  }

  // 2. Negation: negators inside matched tags (e.g. "not coming") belong to the tag.
  const protectedIdx = new Set<number>();
  const negTagSpans: Match[] = [];
  for (const m of matches) {
    const words = tokens.slice(m.start, m.end);
    if (words.some((w) => NEGATORS.has(w))) {
      negTagSpans.push(m);
      for (let i = m.start; i < m.end; i++) protectedIdx.add(i);
    }
  }
  const negatedIdx = negationScopes(tokens, joined, protectedIdx);
  for (const m of matches) {
    const own = tokens.slice(m.start, m.end).some((w) => NEGATORS.has(w));
    // Overlapping another scene's negative phrase ("can not come" + "come over") is negated too.
    const overlapsNegTag = negTagSpans.some(
      (n) => n.scene !== m.scene && n.start < m.end && m.start < n.end && !isIdiom(tokens, n),
    );
    m.negated =
      !own &&
      (overlapsNegTag ||
        [...Array(m.end - m.start).keys()].some((k) => negatedIdx.has(m.start + k)));
  }

  // Emotion words that just colour another subject count less ("can't wait for dinner").
  const hasSubject = matches.some(
    (m) => !m.negated && sceneCategory(scenes, m.scene) !== 'emotions' && !MODIFIER_TAGS.has(m.tag),
  );
  if (hasSubject) {
    for (const m of matches) if (MODIFIER_TAGS.has(m.tag)) m.weight *= 0.5;
  }

  // 3. A longer match from another scene covering this one wins ("dinner date" > "dinner").
  for (const m of matches) {
    const covered = matches.some(
      (o) =>
        o.scene !== m.scene &&
        o.start <= m.start &&
        o.end >= m.end &&
        o.end - o.start > m.end - m.start,
    );
    if (covered) m.weight *= 0.35;
  }

  // 4. Per-scene score with diminishing returns for repeated evidence.
  const byScene = new Map<string, Match[]>();
  for (const m of matches) byScene.set(m.scene, [...(byScene.get(m.scene) ?? []), m]);
  const scores = new Map<string, { score: number; matched: string[] }>();
  const sceneById = new Map(scenes.map((s) => [s.scene_id, s]));
  const entities = detectEntities(tokens, joined, negatedIdx);
  const timeEntity = entities.find((e) => e.kind === 'time' && !e.negated);

  for (const [id, ms] of byScene) {
    const positive = ms.filter((m) => !m.negated).sort((a, b) => b.weight - a.weight);
    const negative = ms.filter((m) => m.negated);
    let score = positive.reduce((sum, m, i) => sum + m.weight * 0.5 ** i, 0);
    score -= negative.reduce((sum, m) => sum + m.weight * 0.8, 0);
    const scene = sceneById.get(id)!;
    if (positive.length && intent && scene.intents.includes(intent)) score += 0.7;
    else if (positive.length && intent === 'ask' && scene.intents.includes('invite')) score += 0.3;
    if (positive.length && timeEntity && scene.intents.includes('invite') && intent === 'invite')
      score += 0.3;
    scores.set(id, { score, matched: [...new Set(positive.map((m) => m.tag))] });
  }

  // 5. Rules that move evidence between scenes.
  const bump = (id: string, by: number, why: string) => {
    if (!sceneById.has(id)) return;
    const cur = scores.get(id) ?? { score: 0, matched: [] };
    scores.set(id, { score: cur.score + by, matched: [...cur.matched, why] });
  };
  const negatedTerms = matches.filter((m) => m.negated).map((m) => m.tag);
  const negatedAttendance = ATTENDANCE_WORDS.some((w) =>
    findSpans(tokens, joined, w).some(([s, e]) =>
      [...Array(e - s).keys()].some((k) => negatedIdx.has(s + k)),
    ),
  );
  if (negatedAttendance && (intent !== 'invite' || !isQuestion)) {
    bump('cancel_plans', 2.2, 'negated plan');
  }
  const negatedPositiveEmotion = POSITIVE_EMOTION_WORDS.some((w) =>
    findSpans(tokens, joined, w).some(([s]) => negatedIdx.has(s)),
  );
  if (negatedPositiveEmotion && !negatedAttendance) {
    const hungry = findSpans(tokens, joined, 'hungry').some(([s]) => negatedIdx.has(s));
    if (!hungry) bump('sad_rain', 1.6, 'negated positive feeling');
  }
  const negatedNegativeEmotion = NEGATIVE_EMOTION_WORDS.some((w) =>
    findSpans(tokens, joined, w).some(([s]) => negatedIdx.has(s)),
  );
  if (negatedNegativeEmotion) bump('calm_breathe', 1.6, 'negated negative feeling');
  // An apology that is really about missing a plan.
  if (intent === 'apologize' && (negatedAttendance || has(joined, 'can not make it')))
    bump('cancel_plans', 0.8, 'apology for plan');

  // 6. Rank and calibrate.
  const ranked = [...scores.entries()]
    .filter(([, v]) => v.score > 0.05)
    .sort((a, b) => b[1].score - a[1].score);
  const s1 = ranked[0]?.[1].score ?? 0;
  const s2 = ranked[1]?.[1].score ?? 0;
  // strength: how much evidence; margin: how clearly the winner beats the runner-up.
  // One specific keyword alone lands in "chips"; a keyword plus a matching intent, or a
  // multi-word phrase, reaches "auto"; a tie between two weak readings is still offered as chips.
  const strength = (s: number) => 1 - Math.exp(-s / 1.0);
  const sarcasm = detectSarcasm(text, joined);
  const sarcasmFactor = sarcasm.likely ? 0.5 : 1;

  const candidates: Candidate[] = ranked.slice(0, 3).map(([scene_id, v], i) => {
    const margin = i === 0 ? (s1 > 0 ? (s1 - s2) / s1 : 0) : 0;
    const confidence = strength(v.score) * (0.65 + 0.35 * margin) * sarcasmFactor;
    return { scene_id, score: round(v.score), confidence: round(confidence), matched: v.matched };
  });
  const confidence = candidates[0]?.confidence ?? 0;

  return {
    text,
    normalized,
    intent,
    intents,
    isQuestion,
    entities,
    negation: { present: negatedIdx.size > 0 || negatedTerms.length > 0, negatedTerms },
    sarcasm,
    candidates,
    confidence,
    tier: tierFor(confidence),
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
