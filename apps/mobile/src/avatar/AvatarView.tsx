import { Component, Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { chooseRendererLevel, nextLevelDown, type RendererLevel } from '@anime/scene-engine';
import { LevelAAvatar } from './LevelAAvatar';
import { StaticAvatar } from './StaticAvatar';
import { deviceCaps, loadRendererPrefs, recordDowngrade, recordFailure } from './settings';
import type { AvatarProps, AvatarStats } from './types';

// Lazy: three.js is only evaluated when the 3D level is actually used.
const LevelBAvatar = lazy(() => import('./levelB/LevelBAvatar'));

class AvatarErrorBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface AvatarViewProps extends AvatarProps {
  /** 'auto' picks the best level for this device and downgrades on frame drops / crashes. */
  level?: 'auto' | RendererLevel;
  onStats?: (s: AvatarStats) => void;
}

/**
 * The one component screens use to show an avatar. It never throws: if a renderer crashes it
 * falls back a level, so the surrounding UI (and any chat text) always renders.
 */
export function AvatarView({ level = 'auto', size = 160, onStats, ...props }: AvatarViewProps) {
  const [active, setActive] = useState<RendererLevel>(level === 'auto' ? 'level_a_svg' : level);

  useEffect(() => {
    if (level !== 'auto') {
      setActive(level);
      return;
    }
    let live = true;
    loadRendererPrefs().then((prefs) => {
      if (live) setActive(chooseRendererLevel(deviceCaps(), prefs));
    });
    return () => {
      live = false;
    };
  }, [level]);

  const stepDown = useCallback(
    (reason: 'slow' | 'error') => {
      setActive((cur) => {
        const next = nextLevelDown(cur);
        if (level === 'auto') {
          if (reason === 'slow') void recordDowngrade(next);
          else void recordFailure(cur);
        }
        return next;
      });
    },
    [level],
  );

  const common = { ...props, size, onStats, onSlow: () => stepDown('slow') };
  const placeholder = <View style={{ width: size, height: size }} />;

  return (
    <AvatarErrorBoundary key={active} onError={() => stepDown('error')}>
      {active === 'level_b_3d' ? (
        <Suspense fallback={<StaticAvatar {...common} />}>
          <LevelBAvatar {...common} />
        </Suspense>
      ) : active === 'level_a_svg' ? (
        <LevelAAvatar {...common} />
      ) : active === 'fallback_static' ? (
        <StaticAvatar {...common} />
      ) : (
        placeholder
      )}
    </AvatarErrorBoundary>
  );
}
