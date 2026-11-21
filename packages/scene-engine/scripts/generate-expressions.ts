/**
 * One-time seed for src/avatar/expressions.v1.json. The JSON is the source of truth: edit it
 * directly (or re-run this and bump the version) — the runtime never reads this file.
 *
 *   npx tsx scripts/generate-expressions.ts
 */
import fs from 'node:fs';
import path from 'node:path';

type Weights = Record<string, number>;

// Shorthand → canonical blendshape names (both sides where it makes sense).
const SHORT: Record<string, string[]> = {
  B: ['eyeBlinkLeft', 'eyeBlinkRight'],
  bL: ['eyeBlinkLeft'],
  bR: ['eyeBlinkRight'],
  Sq: ['eyeSquintLeft', 'eyeSquintRight'],
  W: ['eyeWideLeft', 'eyeWideRight'],
  LU: ['eyeLookUp'],
  LD: ['eyeLookDown'],
  LL: ['eyeLookLeft'],
  LR: ['eyeLookRight'],
  Bd: ['browDownLeft', 'browDownRight'],
  dL: ['browDownLeft'],
  dR: ['browDownRight'],
  Bu: ['browInnerUp'],
  Bo: ['browOuterUpLeft', 'browOuterUpRight'],
  oL: ['browOuterUpLeft'],
  oR: ['browOuterUpRight'],
  Sm: ['mouthSmileLeft', 'mouthSmileRight'],
  sL: ['mouthSmileLeft'],
  sR: ['mouthSmileRight'],
  Fr: ['mouthFrownLeft', 'mouthFrownRight'],
  J: ['jawOpen'],
  Pk: ['mouthPucker'],
  Fn: ['mouthFunnel'],
  Cp: ['cheekPuff'],
  Cs: ['cheekSquintLeft', 'cheekSquintRight'],
  Ns: ['noseSneerLeft', 'noseSneerRight'],
  Pr: ['mouthPressLeft', 'mouthPressRight'],
  ML: ['mouthLeft'],
  MR: ['mouthRight'],
  RL: ['mouthRollLower'],
  SU: ['mouthShrugUpper'],
  T: ['tongueOut'],
  C: ['mouthClose'],
};

function expand(spec: string): Weights {
  const out: Weights = {};
  for (const part of spec.split(/\s+/).filter(Boolean)) {
    const [k, v] = part.split('=');
    const names = SHORT[k!];
    if (!names) throw new Error(`unknown shorthand ${k}`);
    for (const n of names) out[n] = Number(v ?? 1);
  }
  return out;
}

interface Row {
  id: string;
  emotion: string;
  w: string;
  head?: [number, number, number]; // pitch, yaw, roll (degrees)
  fx?: string[];
  gesture?: string;
}

// prettier-ignore
const ROWS: Row[] = [
  // neutral / calm
  { id: 'neutral', emotion: 'neutral', w: '' },
  { id: 'calm', emotion: 'calm', w: 'Sm=0.2 Sq=0.1' },
  { id: 'relieved', emotion: 'calm', w: 'Sm=0.35 B=0.6 Bu=0.3', head: [-4, 0, 0] },
  { id: 'content', emotion: 'calm', w: 'Sm=0.45 Sq=0.3 Cs=0.2' },
  { id: 'zen', emotion: 'calm', w: 'B=1 Sm=0.25', head: [-3, 0, 0], fx: ['sparkles'] },
  { id: 'dreamy', emotion: 'calm', w: 'B=0.5 Sm=0.4 LU=0.6', head: [-6, 0, 6] },
  { id: 'focused', emotion: 'neutral', w: 'Bd=0.3 Sq=0.3 Pr=0.3' },
  { id: 'serious', emotion: 'neutral', w: 'Bd=0.25 Pr=0.4' },
  { id: 'stern', emotion: 'angry', w: 'Bd=0.6 Pr=0.6 Sq=0.2' },
  { id: 'thinking', emotion: 'confused', w: 'LU=0.7 LR=0.4 oR=0.5 ML=0.4 Pr=0.3', head: [-4, 6, 4], gesture: 'think_chin' },
  { id: 'curious', emotion: 'confused', w: 'oL=0.6 W=0.25 Sm=0.15', head: [0, 0, 8] },
  // happy family
  { id: 'smile_soft', emotion: 'happy', w: 'Sm=0.4 Cs=0.2' },
  { id: 'smile', emotion: 'happy', w: 'Sm=0.7 Cs=0.4 Sq=0.2' },
  { id: 'smile_closed_eyes', emotion: 'happy', w: 'Sm=0.75 B=0.85 Cs=0.5' },
  { id: 'grin', emotion: 'happy', w: 'Sm=0.9 J=0.25 Cs=0.6 Sq=0.35' },
  { id: 'grin_wide', emotion: 'excited', w: 'Sm=1 J=0.45 Cs=0.7 Sq=0.4 Bo=0.3' },
  { id: 'beam', emotion: 'happy', w: 'Sm=1 J=0.35 B=0.9 Cs=0.8', head: [-4, 0, 0] },
  { id: 'giggle', emotion: 'happy', w: 'Sm=0.8 J=0.2 Sq=0.6 Cs=0.6', head: [2, 0, -6], gesture: 'cover_mouth' },
  { id: 'chuckle', emotion: 'happy', w: 'Sm=0.7 J=0.15 Sq=0.5', head: [-3, 0, 3] },
  { id: 'laugh', emotion: 'happy', w: 'Sm=1 J=0.75 Sq=0.8 Cs=0.9 Bo=0.3', head: [-8, 0, 0] },
  { id: 'laugh_hard', emotion: 'happy', w: 'Sm=1 J=1 B=0.9 Cs=1 Bu=0.4', head: [-12, 0, 4] },
  { id: 'laugh_tears', emotion: 'happy', w: 'Sm=1 J=0.85 B=0.9 Cs=1 Bu=0.5', head: [-8, 0, -4], fx: ['tears_joy'] },
  { id: 'proud', emotion: 'proud', w: 'Sm=0.55 Sq=0.25 Pr=0.2', head: [-6, 0, 0] },
  { id: 'confident', emotion: 'proud', w: 'sR=0.6 sL=0.3 oL=0.3 Sq=0.2', head: [-4, -4, 0] },
  { id: 'cool', emotion: 'proud', w: 'sR=0.45 Sq=0.45 Pr=0.2', head: [-3, -6, -3] },
  { id: 'smirk', emotion: 'proud', w: 'sR=0.7 MR=0.3 oR=0.35 Sq=0.25', head: [0, -5, -4] },
  { id: 'smirk_left', emotion: 'proud', w: 'sL=0.7 ML=0.3 oL=0.35 Sq=0.25', head: [0, 5, 4] },
  { id: 'wink', emotion: 'happy', w: 'bL=1 sL=0.75 sR=0.5 Cs=0.4', head: [0, 0, 5] },
  { id: 'wink_tongue', emotion: 'happy', w: 'bL=1 Sm=0.6 J=0.3 T=0.8', head: [0, 0, 6] },
  { id: 'tongue_out', emotion: 'happy', w: 'J=0.35 T=1 Sm=0.3 Sq=0.3' },
  { id: 'playful', emotion: 'happy', w: 'Sm=0.6 sL=0.8 bR=0.4 T=0.3', head: [0, 4, -6] },
  { id: 'cheeky', emotion: 'happy', w: 'sR=0.8 bR=0.5 Cp=0.3', head: [0, -4, -6] },
  { id: 'sly', emotion: 'happy', w: 'sL=0.6 Sq=0.6 LL=0.6', head: [0, 6, 0] },
  { id: 'mischievous', emotion: 'happy', w: 'Sm=0.55 Bd=0.3 Sq=0.5 LL=0.3', head: [4, 0, 0] },
  { id: 'silly', emotion: 'happy', w: 'J=0.3 T=0.7 bR=1 Bo=0.6', head: [0, 0, 12] },
  { id: 'goofy', emotion: 'happy', w: 'J=0.6 Sm=0.8 W=0.6 Bo=0.7 LL=0.5', head: [0, 0, -10] },
  { id: 'cheek_puff', emotion: 'happy', w: 'Cp=1 Pk=0.3 W=0.3' },
  { id: 'whistle', emotion: 'calm', w: 'Pk=0.9 Fn=0.3 LU=0.5 Bo=0.3', head: [-4, 0, 4], fx: ['music_note'] },
  // excited
  { id: 'excited', emotion: 'excited', w: 'Sm=0.9 J=0.5 W=0.6 Bo=0.6', head: [-4, 0, 0], fx: ['sparkles'] },
  { id: 'ecstatic', emotion: 'excited', w: 'Sm=1 J=0.8 B=0.8 Cs=1 Bo=0.7', head: [-10, 0, 0], fx: ['sparkles'], gesture: 'fist_pump' },
  { id: 'starstruck', emotion: 'excited', w: 'Sm=0.9 J=0.6 W=0.8 Bu=0.4', fx: ['star_eyes'] },
  { id: 'hyped', emotion: 'excited', w: 'Sm=1 J=0.7 W=0.5 Bo=0.8 Cs=0.6', head: [-8, 0, 0], gesture: 'fist_pump' },
  { id: 'cheering', emotion: 'excited', w: 'Sm=1 J=0.9 Sq=0.5 Cs=0.8 Bo=0.5', head: [-10, 0, 0], gesture: 'fist_pump' },
  { id: 'grateful', emotion: 'grateful', w: 'Sm=0.6 B=0.6 Bu=0.4', head: [6, 0, 0], gesture: 'pray' },
  { id: 'hopeful', emotion: 'grateful', w: 'Sm=0.35 Bu=0.6 W=0.2 LU=0.4', head: [-4, 0, 0] },
  { id: 'thumbs_up_smile', emotion: 'happy', w: 'Sm=0.8 Sq=0.4 Cs=0.5', gesture: 'thumbs_up' },
  // love / shy
  { id: 'in_love', emotion: 'love', w: 'Sm=0.7 B=0.4 Bu=0.4', head: [0, 0, 8], fx: ['blush', 'hearts'] },
  { id: 'heart_eyes', emotion: 'love', w: 'Sm=0.85 J=0.3 W=0.3', fx: ['heart_eyes', 'blush'] },
  { id: 'kiss', emotion: 'love', w: 'Pk=1 B=0.8 Bu=0.3', head: [0, 0, 6], fx: ['blush'] },
  { id: 'blow_kiss', emotion: 'love', w: 'Pk=1 bL=1 Bu=0.3', head: [0, 0, 8], fx: ['heart_small'], gesture: 'blow_kiss' },
  { id: 'heart_hands_smile', emotion: 'love', w: 'Sm=0.8 Sq=0.4 Cs=0.5', fx: ['blush'], gesture: 'heart_hands' },
  { id: 'shy', emotion: 'love', w: 'Sm=0.4 LD=0.7 Bu=0.4 Pr=0.2', head: [8, 6, 8], fx: ['blush'] },
  { id: 'bashful', emotion: 'love', w: 'Sm=0.5 LD=0.8 Bu=0.5 B=0.3', head: [10, -6, -8], fx: ['blush'], gesture: 'hands_on_cheeks' },
  { id: 'blush_smile', emotion: 'love', w: 'Sm=0.65 Sq=0.4', fx: ['blush'] },
  { id: 'embarrassed', emotion: 'nervous', w: 'Sm=0.3 Fr=0.2 Bu=0.7 LD=0.5 Pr=0.4', head: [8, 0, 0], fx: ['blush', 'sweat'] },
  { id: 'awkward', emotion: 'nervous', w: 'Pr=0.6 sR=0.3 Bu=0.6 LL=0.6', head: [0, 6, 0], fx: ['sweat'] },
  { id: 'nervous_smile', emotion: 'nervous', w: 'Sm=0.5 Pr=0.4 Bu=0.8 W=0.3', fx: ['sweat'] },
  { id: 'grimace', emotion: 'nervous', w: 'Sm=0.4 J=0.15 Pr=0.6 Bd=0.3 Sq=0.5 SU=0.4' },
  { id: 'cringe', emotion: 'nervous', w: 'Sm=0.3 Pr=0.7 Sq=0.8 Ns=0.4 Bd=0.4', head: [4, 8, 6] },
  // sad
  { id: 'sad', emotion: 'sad', w: 'Fr=0.6 Bu=0.7 LD=0.3' },
  { id: 'sad_pout', emotion: 'sad', w: 'Fr=0.6 Pk=0.4 RL=0.3 Bu=0.8', head: [6, 0, 0] },
  { id: 'teary', emotion: 'sad', w: 'Fr=0.5 Bu=0.9 W=0.3', fx: ['tears_small'] },
  { id: 'cry', emotion: 'sad', w: 'Fr=0.8 J=0.3 Bu=1 Sq=0.6', head: [6, 0, 0], fx: ['tears'] },
  { id: 'sob', emotion: 'sad', w: 'Fr=1 J=0.6 B=0.9 Bu=1', head: [10, 0, 0], fx: ['tears'] },
  { id: 'wail', emotion: 'sad', w: 'Fr=0.9 J=1 B=0.9 Bu=1', head: [-10, 0, 0], fx: ['tears'] },
  { id: 'disappointed', emotion: 'sad', w: 'Fr=0.4 Pr=0.4 LD=0.6 Bu=0.4', head: [6, 0, 0] },
  { id: 'sulk', emotion: 'sad', w: 'Fr=0.5 Pk=0.3 Bd=0.3 LD=0.6', head: [8, 8, 0] },
  { id: 'lonely', emotion: 'sad', w: 'Fr=0.3 Bu=0.6 LD=0.7', head: [8, 0, 6], fx: ['rain_cloud'] },
  { id: 'hurt', emotion: 'sad', w: 'Fr=0.6 Bu=0.9 Sq=0.4 Pr=0.4', head: [4, 0, -6] },
  { id: 'heartbroken', emotion: 'sad', w: 'Fr=0.8 Bu=1 B=0.5', head: [10, 0, 0], fx: ['tears_small', 'broken_heart'] },
  { id: 'sorry', emotion: 'sorry', w: 'Fr=0.3 Bu=0.9 Pr=0.3 LD=0.4', head: [8, 0, 0], gesture: 'bow' },
  { id: 'apologetic', emotion: 'sorry', w: 'Sm=0.25 Bu=0.8 Pr=0.3', head: [6, 0, 6], gesture: 'pray' },
  { id: 'pleading', emotion: 'sorry', w: 'Fr=0.3 Pk=0.3 Bu=1 W=0.5 LU=0.4', head: [6, 0, 0], fx: ['sparkle_eyes'], gesture: 'pray' },
  { id: 'sympathetic', emotion: 'sorry', w: 'Sm=0.2 Bu=0.7 Pr=0.3', head: [4, 0, 8] },
  // angry
  { id: 'annoyed', emotion: 'angry', w: 'Bd=0.5 Pr=0.5 Sq=0.3 ML=0.2' },
  { id: 'grumpy', emotion: 'angry', w: 'Bd=0.7 Fr=0.5 Pr=0.4 Sq=0.3', head: [4, 0, 0] },
  { id: 'pout', emotion: 'angry', w: 'Pk=0.6 Fr=0.3 Bd=0.4 Cp=0.3', head: [4, 8, 0] },
  { id: 'huff', emotion: 'angry', w: 'Cp=0.8 Bd=0.6 Sq=0.4', head: [-4, 10, 0], fx: ['steam_small'] },
  { id: 'angry', emotion: 'angry', w: 'Bd=0.9 Fr=0.6 Sq=0.5 Ns=0.4 Pr=0.4', fx: ['anger_mark'] },
  { id: 'furious', emotion: 'angry', w: 'Bd=1 Fr=0.7 J=0.4 Sq=0.6 Ns=0.7 SU=0.6', head: [4, 0, 0], fx: ['anger_mark', 'steam'] },
  { id: 'rage', emotion: 'angry', w: 'Bd=1 Fr=0.9 J=0.8 W=0.4 Ns=1 SU=0.8', head: [-4, 0, 0], fx: ['anger_mark', 'steam'] },
  { id: 'disgusted', emotion: 'angry', w: 'Ns=1 SU=0.7 Fr=0.4 Sq=0.6 Bd=0.4', head: [2, -8, 0] },
  { id: 'gross', emotion: 'angry', w: 'Ns=0.8 Fr=0.6 T=0.4 J=0.3 Sq=0.8', head: [4, 10, 0] },
  { id: 'sneer', emotion: 'angry', w: 'Ns=0.6 sR=0.3 SU=0.5 Sq=0.4', head: [-3, -6, 0] },
  { id: 'skeptical', emotion: 'confused', w: 'oL=0.8 dR=0.5 Pr=0.4 ML=0.3', head: [0, 0, -6] },
  { id: 'suspicious', emotion: 'confused', w: 'Sq=0.8 Bd=0.5 Pr=0.4 LR=0.6', head: [0, -8, 0] },
  { id: 'side_eye', emotion: 'bored', w: 'Sq=0.5 LL=1 Pr=0.4 Bd=0.2', head: [0, -6, 0] },
  { id: 'eye_roll', emotion: 'bored', w: 'LU=1 B=0.3 Pr=0.4 Bo=0.3', head: [-6, 0, 6] },
  { id: 'unimpressed', emotion: 'bored', w: 'B=0.45 Pr=0.6 Fr=0.15' },
  // tired / bored / sick
  { id: 'bored', emotion: 'bored', w: 'B=0.55 Fr=0.2 LL=0.3', head: [6, 0, 10] },
  { id: 'sleepy', emotion: 'tired', w: 'B=0.75 Fr=0.15 J=0.05 Bu=0.2', head: [8, 0, 10], fx: ['zzz'] },
  { id: 'yawn', emotion: 'tired', w: 'J=1 Fn=0.4 B=0.8 Bu=0.5', head: [-10, 0, 0], gesture: 'cover_mouth' },
  { id: 'asleep', emotion: 'tired', w: 'B=1 J=0.08 Pk=0.2', head: [14, 0, 14], fx: ['zzz', 'bubble_snot'] },
  { id: 'exhausted', emotion: 'tired', w: 'B=0.6 Fr=0.4 J=0.2 Bu=0.6', head: [12, 0, 0], fx: ['sweat'] },
  { id: 'dizzy', emotion: 'confused', w: 'J=0.3 Fr=0.2 W=0.5', head: [0, 0, 14], fx: ['dizzy_eyes', 'stars_orbit'] },
  { id: 'sick', emotion: 'sad', w: 'Fr=0.5 B=0.5 Bu=0.6', head: [6, 0, 6], fx: ['green_tint', 'thermometer'] },
  { id: 'nauseous', emotion: 'sad', w: 'Pr=0.8 Cp=0.6 Sq=0.6 Bu=0.6', head: [8, 0, 0], fx: ['green_tint'] },
  { id: 'hot_sweat', emotion: 'tired', w: 'J=0.4 T=0.4 B=0.4 Bu=0.4', fx: ['sweat', 'heat'] },
  { id: 'cold_shiver', emotion: 'scared', w: 'Pr=0.8 Sq=0.4 Bu=0.6', fx: ['shiver', 'blue_tint'] },
  // surprise / fear
  { id: 'surprised', emotion: 'surprised', w: 'W=0.8 Bo=0.8 Bu=0.5 J=0.4 Fn=0.3' },
  { id: 'shocked', emotion: 'surprised', w: 'W=1 Bo=1 Bu=0.7 J=0.8 Fn=0.4', head: [-4, 0, 0], fx: ['exclamation'] },
  { id: 'gasp', emotion: 'surprised', w: 'W=0.9 Bu=0.8 J=0.5 Fn=0.8', head: [-6, 0, 0], gesture: 'cover_mouth' },
  { id: 'astonished', emotion: 'surprised', w: 'W=1 Bo=1 J=1 Fn=0.5', head: [-8, 0, 0], fx: ['exclamation'] },
  { id: 'impressed', emotion: 'surprised', w: 'W=0.4 Bo=0.6 Pk=0.5 Fn=0.3 Sm=0.2', head: [-4, 0, 0] },
  { id: 'scared', emotion: 'scared', w: 'W=1 Bu=1 Fr=0.4 J=0.3 SU=0.3', head: [6, 0, 0], fx: ['sweat'] },
  { id: 'terrified', emotion: 'scared', w: 'W=1 Bu=1 Fr=0.6 J=0.8 SU=0.5', head: [8, 0, 0], fx: ['sweat', 'shiver', 'blue_tint'] },
  { id: 'worried', emotion: 'nervous', w: 'Bu=0.9 Fr=0.35 Pr=0.4 LD=0.3', fx: ['sweat'] },
  { id: 'anxious', emotion: 'nervous', w: 'Bu=1 Pr=0.6 W=0.4 LL=0.4', fx: ['sweat'] },
  { id: 'confused', emotion: 'confused', w: 'oL=0.8 dR=0.4 ML=0.4 Pr=0.2', head: [0, 0, 10], fx: ['question'] },
  { id: 'puzzled', emotion: 'confused', w: 'oR=0.7 Bd=0.2 Pk=0.3 LU=0.4', head: [0, 0, -10], fx: ['question'], gesture: 'think_chin' },
  { id: 'determined', emotion: 'proud', w: 'Bd=0.6 Pr=0.6 Sq=0.3', head: [4, 0, 0], gesture: 'fist_pump' },
  { id: 'shush', emotion: 'calm', w: 'Pk=0.7 Bu=0.3 bR=0.3', gesture: 'shush' },
  { id: 'pained', emotion: 'tired', w: 'Sq=0.9 Fr=0.4 Pr=0.6 Bd=0.4', head: [8, 0, 0], gesture: 'facepalm' },
  { id: 'facepalm', emotion: 'tired', w: 'B=0.9 Fr=0.3 Pr=0.4', head: [10, 0, 0], gesture: 'facepalm' },
  { id: 'shrug', emotion: 'confused', w: 'Sm=0.2 Pr=0.4 Bo=0.7', head: [0, 0, 6], gesture: 'shrug' },
  { id: 'wave_hello', emotion: 'happy', w: 'Sm=0.8 J=0.2 Sq=0.3 Bo=0.3', gesture: 'wave' },
  { id: 'peace', emotion: 'happy', w: 'Sm=0.8 bR=0.8 Cs=0.4', head: [0, 0, 6], gesture: 'peace' },
  { id: 'salute', emotion: 'proud', w: 'Sm=0.4 Pr=0.3', head: [-2, 0, 0], gesture: 'salute' },
  { id: 'clapping', emotion: 'excited', w: 'Sm=1 J=0.4 Sq=0.5 Cs=0.6', gesture: 'clap' },
  { id: 'bow_polite', emotion: 'grateful', w: 'Sm=0.4 B=0.8', head: [18, 0, 0], gesture: 'bow' },
  { id: 'point_ahead', emotion: 'excited', w: 'Sm=0.6 W=0.3 Bo=0.4', gesture: 'point' },
];

/** Background glow per emotion: warm for happy, blue for sad, etc. */
const GLOW: Record<string, string> = {
  neutral: '#D9D6F2',
  calm: '#A8E6D9',
  happy: '#FFD38A',
  excited: '#FFB86B',
  proud: '#FFCF7A',
  grateful: '#FFDDA8',
  love: '#FFB3CF',
  sad: '#9EC5FF',
  sorry: '#B8C9F5',
  angry: '#FF8F80',
  nervous: '#E3D27A',
  confused: '#C9B6F2',
  bored: '#C8CDD6',
  tired: '#B7B3E0',
  surprised: '#FFE27A',
  scared: '#B0A8E8',
};

const ids = new Set<string>();
const expressions = ROWS.map((r) => {
  if (ids.has(r.id)) throw new Error(`duplicate ${r.id}`);
  ids.add(r.id);
  return {
    id: r.id,
    emotion: r.emotion,
    weights: expand(r.w),
    head: r.head
      ? { pitch: r.head[0], yaw: r.head[1], roll: r.head[2] }
      : { pitch: 0, yaw: 0, roll: 0 },
    fx: r.fx ?? [],
    gesture: r.gesture ?? null,
    glow: GLOW[r.emotion] ?? GLOW.neutral,
  };
});

const out = {
  version: '1.0.0',
  blendshapes: [...new Set(Object.values(SHORT).flat())].sort(),
  intensity: {
    '1': { weight: 0.6, speed: 0.8 },
    '2': { weight: 0.85, speed: 1 },
    '3': { weight: 1, speed: 1.25 },
  },
  expressions,
};
const file = path.resolve(__dirname, '..', 'src', 'avatar', 'expressions.v1.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${expressions.length} expressions to ${path.relative(process.cwd(), file)}`);
