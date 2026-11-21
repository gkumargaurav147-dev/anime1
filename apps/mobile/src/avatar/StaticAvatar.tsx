import { useEffect, useMemo, useRef } from 'react';
import { LevelASvgRenderer } from '@anime/scene-engine';
import { SvgTree } from './SvgTree';
import { nextIdPrefix, type LevelProps } from './types';

const renderer = new LevelASvgRenderer();

/**
 * Fallback level: one still frame of the avatar (held gesture pose, no idle loop). Costs one
 * render, so it works on any device. When artists deliver pre-rendered loops (Lottie/video,
 * see ASSET_SPEC.md §8) they plug in here.
 */
export function StaticAvatar(props: LevelProps) {
  const idPrefix = useRef(nextIdPrefix()).current;
  const { onStats } = props;
  const tree = useMemo(() => {
    const req = {
      config: props.config,
      avatarId: props.avatarId,
      expressionId: props.expressionId,
      intensity: props.intensity,
      gestureId: props.gestureId ?? null,
      gestureElapsedMs: props.gestureId ? 900 : 0,
      framing: props.framing ?? 'circle',
      glow: props.glow,
      idPrefix,
    };
    return renderer.tree(req, renderer.frame(req, 0, { idle: false }));
  }, [
    props.config,
    props.avatarId,
    props.expressionId,
    props.intensity,
    props.gestureId,
    props.framing,
    props.glow,
    idPrefix,
  ]);

  useEffect(() => {
    onStats?.({ level: 'fallback_static', fps: null });
  }, [onStats]);

  return <SvgTree tree={tree} size={props.size} />;
}
