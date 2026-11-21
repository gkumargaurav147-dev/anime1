import type { AssetRef } from '../assets/AssetProvider';
import { avatarFrame, type AvatarAnimState, type AvatarFrame } from './animation';
import { renderBustSvgNode, renderBust, type Framing } from './levelA/bust';
import { avatarKey, hash32, type AvatarConfig } from './model';
import { toSvgString, type SvgNode } from './svg';

/**
 * The engine never draws an avatar itself; it asks an AvatarRenderer. Three levels exist:
 *
 *  - level_b_3d       real 3D bust (glTF + morph targets) — mobile only, behind a flag
 *  - level_a_svg      2.5D layered SVG bust with soft shading — default everywhere
 *  - fallback_static  one still frame (or a pre-rendered clip) for weak devices / failures
 *
 * All levels consume the same AvatarConfig + AvatarFrame, so an avatar_id looks the same at
 * every level, in every scene, snap and profile. Live (animated) drawing is platform code
 * that implements this contract; still images are produced here and are deterministic.
 */
export type RendererLevel = 'level_b_3d' | 'level_a_svg' | 'fallback_static';
export const DOWNGRADE_ORDER: RendererLevel[] = ['level_b_3d', 'level_a_svg', 'fallback_static'];

export interface AvatarRenderRequest {
  config: AvatarConfig;
  /** Used to seed idle motion (blink timing) so it is stable per avatar. */
  avatarId: string;
  expressionId: string;
  intensity?: 1 | 2 | 3;
  gestureId?: string | null;
  gestureElapsedMs?: number;
  framing?: Framing;
  /** Background glow colour; null = transparent. Defaults to the expression's mood colour. */
  glow?: string | null;
  flip?: boolean;
  /** Unique id prefix when several avatars share one document. */
  idPrefix?: string;
}

export interface AvatarRenderer {
  readonly level: RendererLevel;
  /** Frame data for time t (shared animation math). */
  frame(req: AvatarRenderRequest, tMs: number, opts?: { idle?: boolean }): AvatarFrame;
  /** A still image of the avatar at time t (scenes, snaps, thumbnails). */
  renderStill(req: AvatarRenderRequest, tMs?: number, opts?: { idle?: boolean }): AssetRef;
}

const animState = (req: AvatarRenderRequest, idle: boolean): AvatarAnimState => ({
  expressionId: req.expressionId,
  intensity: req.intensity,
  gestureId: req.gestureId ?? null,
  gestureElapsedMs: req.gestureElapsedMs ?? 0,
  seed: req.avatarId,
  idle,
});

export class LevelASvgRenderer implements AvatarRenderer {
  readonly level = 'level_a_svg' as const;

  frame(req: AvatarRenderRequest, tMs: number, opts: { idle?: boolean } = {}) {
    return avatarFrame(animState(req, opts.idle ?? true), tMs);
  }

  /** SVG node tree for one frame (mobile maps this to react-native-svg). */
  tree(req: AvatarRenderRequest, frame: AvatarFrame): SvgNode {
    return renderBust(req.config, frame, {
      framing: req.framing,
      glow: req.glow,
      flip: req.flip,
      idPrefix: req.idPrefix ?? defaultPrefix(req),
    });
  }

  renderStill(
    req: AvatarRenderRequest,
    tMs = 0,
    opts: { idle?: boolean } = { idle: false },
  ): AssetRef {
    const frame = this.frame(req, tMs, opts);
    return {
      format: 'svg',
      width: 256,
      height: 256,
      anchor: [128, 256],
      svg: toSvgString(this.tree(req, frame)),
    };
  }

  /** Standalone SVG document (profile pictures, exports). */
  renderDocument(
    req: AvatarRenderRequest,
    tMs = 0,
    opts: { idle?: boolean } = { idle: false },
  ): string {
    const frame = this.frame(req, tMs, opts);
    return toSvgString(
      renderBustSvgNode(req.config, frame, {
        framing: req.framing,
        glow: req.glow,
        flip: req.flip,
        idPrefix: req.idPrefix ?? defaultPrefix(req),
      }),
    );
  }
}

const defaultPrefix = (req: AvatarRenderRequest) =>
  `a${hash32(`${avatarKey(req.config)}|${req.avatarId}`).toString(36)}_`;

// ---------- choosing and downgrading ----------

export interface DeviceCaps {
  platform: 'ios' | 'android' | 'web' | 'node';
  webgl: boolean;
  /** Rough device class from RAM / year / benchmark; 'low' skips 3D entirely. */
  tier: 'low' | 'mid' | 'high';
}

export interface RendererPrefs {
  /** Feature flag: allow the 3D prototype. Off by default. */
  enable3d: boolean;
  /** A level forced for this device after earlier frame drops (persisted by the app). */
  downgradedTo?: RendererLevel | null;
  /** A level that crashed on this device; never try it (or anything above it) again. */
  failed?: RendererLevel[];
}

/** Best level allowed by flags, device capability and past downgrades/failures. */
export function chooseRendererLevel(caps: DeviceCaps, prefs: RendererPrefs): RendererLevel {
  const blocked = new Set(prefs.failed ?? []);
  const floor = prefs.downgradedTo ? DOWNGRADE_ORDER.indexOf(prefs.downgradedTo) : 0;
  for (const level of DOWNGRADE_ORDER.slice(floor)) {
    if (blocked.has(level)) continue;
    if (
      level === 'level_b_3d' &&
      (!prefs.enable3d || !caps.webgl || caps.tier === 'low' || caps.platform === 'node')
    )
      continue;
    if (level === 'level_a_svg' && caps.tier === 'low' && caps.platform === 'android') continue;
    return level;
  }
  return 'fallback_static';
}

export const nextLevelDown = (level: RendererLevel): RendererLevel =>
  DOWNGRADE_ORDER[Math.min(DOWNGRADE_ORDER.length - 1, DOWNGRADE_ORDER.indexOf(level) + 1)]!;

/**
 * Watches frame times and says when to step down a level. 30 fps target: if a 2-second
 * window averages under `minFps` twice in a row (ignoring the first window while assets load),
 * it reports a downgrade once.
 */
export class FrameRateGovernor {
  private windowStart: number | null = null;
  private frames = 0;
  private windows = 0;
  private badStreak = 0;
  private tripped = false;
  readonly history: number[] = [];

  constructor(
    private readonly minFps = 24,
    private readonly windowMs = 2000,
    private readonly badWindowsToTrip = 2,
    /** Gaps longer than this between frames = paused, not slow (≈ 4 fps). */
    private readonly pauseGapMs = 250,
  ) {}

  private lastTick: number | null = null;

  /** Call once per rendered frame. Returns true exactly once when a downgrade is due. */
  tick(nowMs: number): boolean {
    // A long gap means the app/tab was paused or hidden (the OS throttles or stops frames),
    // not that the device is slow: restart the window instead of counting it.
    const paused = this.lastTick !== null && nowMs - this.lastTick > this.pauseGapMs;
    this.lastTick = nowMs;
    if (this.windowStart === null || paused) {
      this.windowStart = nowMs;
      this.frames = 0;
      return false;
    }
    this.frames++;
    const elapsed = nowMs - this.windowStart;
    if (elapsed < this.windowMs) return false;
    const fps = (this.frames * 1000) / elapsed;
    this.history.push(Math.round(fps * 10) / 10);
    this.windows++;
    this.windowStart = nowMs;
    this.frames = 0;
    if (this.windows === 1) return false; // warm-up window
    this.badStreak = fps < this.minFps ? this.badStreak + 1 : 0;
    if (!this.tripped && this.badStreak >= this.badWindowsToTrip) {
      this.tripped = true;
      return true;
    }
    return false;
  }

  get lastFps() {
    return this.history.at(-1) ?? null;
  }
}
