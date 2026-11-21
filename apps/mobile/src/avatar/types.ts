import type { AvatarConfig, Framing, RendererLevel } from '@anime/scene-engine';

export interface AvatarProps {
  config: AvatarConfig;
  /** Seeds idle motion (blink timing) so it is stable per avatar. */
  avatarId: string;
  expressionId: string;
  intensity?: 1 | 2 | 3;
  gestureId?: string | null;
  /** Change this number to replay the same gesture. */
  gestureKey?: number;
  framing?: Framing;
  /** Mood glow colour; null = transparent; undefined = expression's mood colour. */
  glow?: string | null;
  size?: number;
  /** false = one still frame (thumbnails, lists). */
  animated?: boolean;
}

export interface AvatarStats {
  level: RendererLevel;
  fps: number | null;
  triangles?: number;
}

export interface LevelProps extends AvatarProps {
  size: number;
  /** Called when the frame-rate governor says this level is too slow here. */
  onSlow?: () => void;
  onStats?: (s: AvatarStats) => void;
}

let counter = 0;
/** Unique SVG id prefix per mounted avatar (inline SVGs share one id space on web). */
export const nextIdPrefix = () => `v${(counter++).toString(36)}_`;
