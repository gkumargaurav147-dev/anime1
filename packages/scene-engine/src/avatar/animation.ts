import { hash32, prng } from './model';
import {
  getExpression,
  getGesture,
  intensityScale,
  scaledWeights,
  type GestureDef,
  type HandPose,
  type HeadPose,
} from './expressions';

/**
 * Everything a renderer needs to draw one frame. Pure data, identical for the SVG bust and
 * the 3D bust, so both animate the same way.
 */
export interface AvatarFrame {
  /** Blendshape weights 0..1 (canonical names). */
  weights: Record<string, number>;
  /** Degrees. */
  head: HeadPose;
  /** 0..1 breathing phase amplitude (chest rise). */
  breath: number;
  /** Extra vertical body offset in bust units (bowing, shrugging). */
  bodyDy: number;
  hands: { left: HandPose | null; right: HandPose | null };
  fx: string[];
  glow: string;
}

export interface AvatarAnimState {
  expressionId: string;
  intensity?: 1 | 2 | 3;
  gestureId?: string | null;
  /** ms since the gesture started (renderer tracks it). */
  gestureElapsedMs?: number;
  /** Per-avatar seed so two avatars don't blink in sync. */
  seed: string;
  /** Turn off idle motion (static snapshots, tests). */
  idle?: boolean;
}

// ---------- idle loop ----------

const BLINK_MS = 160;

/** Blink amount 0..1 at time t: one blink every 3–5 s, timing unique per avatar. */
export function blinkAt(tMs: number, seed: string): number {
  const rnd = prng(hash32(`blink:${seed}`));
  let at = 800 + rnd() * 2000; // first blink
  while (at + BLINK_MS < tMs) at += 3000 + rnd() * 2000;
  const dt = tMs - at;
  if (dt < 0 || dt > BLINK_MS) return 0;
  // Fast close, slightly slower open.
  const k = dt / BLINK_MS;
  return k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
}

/** Breathing (≈4 s cycle) and a slow, small head sway. */
export function idleMotion(tMs: number, seed: string) {
  const phase = (hash32(`idle:${seed}`) % 1000) / 1000;
  const s = tMs / 1000;
  const tau = Math.PI * 2;
  return {
    breath: 0.5 + 0.5 * Math.sin(tau * (s / 4 + phase)),
    head: {
      pitch: 1.2 * Math.sin(tau * (s / 5.3 + phase)),
      yaw: 2.5 * Math.sin(tau * (s / 7.1 + phase * 2)),
      roll: 1.6 * Math.sin(tau * (s / 9.2 + phase * 3)),
    },
  };
}

// ---------- gestures ----------

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function lerpHand(a: HandPose | undefined, b: HandPose | undefined, k: number): HandPose | null {
  if (!a && !b) return null;
  if (!a) return b!;
  if (!b) return a;
  return {
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    rot: lerp(a.rot, b.rot, k),
    shape: k < 0.5 ? a.shape : b.shape,
    scale: lerp(a.scale ?? 1, b.scale ?? 1, k),
  };
}

/** Pose of a gesture at `elapsedMs` (already speed-scaled by the caller). */
export function sampleGesture(g: GestureDef, elapsedMs: number) {
  let t = elapsedMs / g.duration_ms;
  t = g.loop ? t % 1 : Math.min(1, Math.max(0, t));
  const keys = g.keys;
  let i = keys.findIndex((k) => k.t >= t);
  if (i <= 0) i = i === 0 ? 1 : keys.length - 1;
  const a = keys[i - 1]!;
  const b = keys[i]!;
  const k = ease(b.t === a.t ? 1 : (t - a.t) / (b.t - a.t));
  const head =
    a.head || b.head
      ? {
          pitch: lerp(a.head?.pitch ?? 0, b.head?.pitch ?? 0, k),
          yaw: lerp(a.head?.yaw ?? 0, b.head?.yaw ?? 0, k),
          roll: lerp(a.head?.roll ?? 0, b.head?.roll ?? 0, k),
        }
      : null;
  return {
    left: lerpHand(a.left, b.left, k),
    right: lerpHand(a.right, b.right, k),
    head,
    bodyDy: lerp(a.body?.dy ?? 0, b.body?.dy ?? 0, k),
  };
}

// ---------- frame ----------

/** Builds the frame at time `tMs`: expression (scaled) + idle loop + gesture. */
export function avatarFrame(state: AvatarAnimState, tMs: number): AvatarFrame {
  const expr = getExpression(state.expressionId);
  const level = state.intensity ?? 2;
  const weights = scaledWeights(expr, level);
  const { speed } = intensityScale(level);
  const idleOn = state.idle !== false;

  const head = { ...expr.head };
  let breath = 0.5;
  if (idleOn) {
    const idle = idleMotion(tMs * speed, state.seed);
    breath = idle.breath;
    head.pitch += idle.head.pitch;
    head.yaw += idle.head.yaw;
    head.roll += idle.head.roll;
    const blink = blinkAt(tMs, state.seed);
    if (blink > 0) {
      weights.eyeBlinkLeft = Math.max(weights.eyeBlinkLeft ?? 0, blink);
      weights.eyeBlinkRight = Math.max(weights.eyeBlinkRight ?? 0, blink);
    }
  }

  let hands: AvatarFrame['hands'] = { left: null, right: null };
  let bodyDy = 0;
  const gesture = getGesture(state.gestureId);
  if (gesture) {
    const pose = sampleGesture(gesture, (state.gestureElapsedMs ?? 0) * speed);
    hands = { left: pose.left, right: pose.right };
    bodyDy = pose.bodyDy;
    if (pose.head) {
      head.pitch += pose.head.pitch;
      head.yaw += pose.head.yaw;
      head.roll += pose.head.roll;
    }
  }

  return { weights, head, breath, bodyDy, hands, fx: expr.fx, glow: expr.glow };
}

/** Linear blend between two frames' weights (for smooth expression changes). */
export function blendWeights(a: Record<string, number>, b: Record<string, number>, k: number) {
  const out: Record<string, number> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  }
  return out;
}
