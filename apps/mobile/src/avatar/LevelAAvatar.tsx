import { useEffect, useRef } from 'react';
import { LevelASvgRenderer, blendWeights, type AvatarRenderRequest } from '@anime/scene-engine';
import { SvgTree } from './SvgTree';
import { nextIdPrefix, type LevelProps } from './types';
import { useAvatarClock } from './useAvatarClock';

const renderer = new LevelASvgRenderer();
const BLEND_MS = 220;

/**
 * Level A: the layered SVG bust, animated at ~30 fps (blink, breathing, sway, expression
 * blends, gesture clips). Pure JS + react-native-svg, so it runs in Expo Go everywhere.
 */
export function LevelAAvatar(props: LevelProps) {
  const { size, animated = true, onSlow, onStats } = props;
  const idPrefix = useRef(nextIdPrefix()).current;
  const { now, fps } = useAvatarClock({ running: animated, onSlow });

  // Gesture restarts when the gesture (or its replay key) changes.
  const gestureStart = useRef(0);
  const gestureSig = `${props.gestureId ?? ''}#${props.gestureKey ?? 0}`;
  const lastGestureSig = useRef('');
  if (gestureSig !== lastGestureSig.current) {
    lastGestureSig.current = gestureSig;
    gestureStart.current = now;
  }

  // Smooth expression changes: blend from the previous weights over BLEND_MS.
  const blendFrom = useRef<{ weights: Record<string, number>; at: number; expr: string } | null>(
    null,
  );
  const lastWeights = useRef<Record<string, number>>({});
  const lastExpr = useRef(props.expressionId);
  if (props.expressionId !== lastExpr.current) {
    blendFrom.current = { weights: lastWeights.current, at: now, expr: lastExpr.current };
    lastExpr.current = props.expressionId;
  }

  const req: AvatarRenderRequest = {
    config: props.config,
    avatarId: props.avatarId,
    expressionId: props.expressionId,
    intensity: props.intensity,
    gestureId: props.gestureId ?? null,
    gestureElapsedMs: props.gestureId ? now - gestureStart.current : 0,
    framing: props.framing ?? 'circle',
    glow: props.glow,
    idPrefix,
  };

  const frame = renderer.frame(req, animated ? now : 0, { idle: animated });
  if (blendFrom.current && animated) {
    const k = Math.min(1, (now - blendFrom.current.at) / BLEND_MS);
    frame.weights = blendWeights(blendFrom.current.weights, frame.weights, k);
    if (k >= 1) blendFrom.current = null;
  }
  lastWeights.current = frame.weights;

  // A new tree every tick is expected: the frame changes 30 times a second.
  const tree = renderer.tree(req, frame);

  useEffect(() => {
    onStats?.({ level: 'level_a_svg', fps });
  }, [fps, onStats]);

  return <SvgTree tree={tree} size={size} />;
}
