import { useEffect, useMemo, useRef } from 'react';
import { Platform, View } from 'react-native';
import * as THREE from 'three';
import type * as FiberWeb from '@react-three/fiber';
import { avatarFrame, avatarKey, FrameRateGovernor } from '@anime/scene-engine';
import type { LevelProps } from '../types';
import { buildProceduralBust } from './proceduralBust';

// The DOM build on web, the expo-gl build on iOS/Android.
/* eslint-disable @typescript-eslint/no-require-imports */
const fiber: typeof FiberWeb =
  Platform.OS === 'web' ? require('@react-three/fiber') : require('@react-three/fiber/native');
/* eslint-enable @typescript-eslint/no-require-imports */
const { Canvas, useFrame } = fiber;

/**
 * Level B prototype: real 3D bust rendered with three.js through react-three-fiber (expo-gl on
 * devices). Same AvatarFrame as Level A, so expressions/gestures/idle match. Loaded lazily by
 * AvatarView only when the 3D flag is on.
 */
export default function LevelBAvatar(props: LevelProps) {
  const { size, framing = 'circle' } = props;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: framing === 'circle' ? size / 2 : framing === 'square' ? size * 0.16 : 0,
        overflow: 'hidden',
      }}
    >
      <Canvas camera={{ position: [0, -0.2, 7.2], fov: 30 }} dpr={[1, 2]}>
        <BustScene {...props} />
      </Canvas>
    </View>
  );
}

function BustScene(props: LevelProps) {
  const { config, onSlow, onStats, animated = true } = props;
  // Rebuild only when the avatar's look changes (not on every new config object).
  const key = avatarKey(config);
  const bust = useMemo(() => buildProceduralBust(config), [key]);
  useEffect(() => () => bust.dispose(), [bust]);

  const governor = useRef(new FrameRateGovernor());
  const smoothed = useRef<Record<string, number>>({});
  const gestureStart = useRef<number | null>(null);
  const gestureSig = useRef('');
  const lastStats = useRef(0);

  useFrame((state) => {
    const now = state.clock.elapsedTime * 1000;
    const sig = `${props.gestureId ?? ''}#${props.gestureKey ?? 0}`;
    if (sig !== gestureSig.current) {
      gestureSig.current = sig;
      gestureStart.current = now;
    }
    const frame = avatarFrame(
      {
        expressionId: props.expressionId,
        intensity: props.intensity,
        gestureId: props.gestureId ?? null,
        gestureElapsedMs: props.gestureId ? now - (gestureStart.current ?? now) : 0,
        seed: props.avatarId,
        idle: animated,
      },
      animated ? now : 0,
    );
    // Ease weights toward the target (smooth expression changes).
    const keys = new Set([...Object.keys(smoothed.current), ...Object.keys(frame.weights)]);
    for (const k of keys) {
      const target = frame.weights[k] ?? 0;
      const cur = smoothed.current[k] ?? 0;
      smoothed.current[k] = k.startsWith('eyeBlink') ? target : cur + (target - cur) * 0.3;
    }
    bust.update({ ...frame, weights: smoothed.current });
    state.scene.background = props.glow === null ? null : new THREE.Color(props.glow ?? frame.glow);

    if (governor.current.tick(now)) onSlow?.();
    if (onStats && now - lastStats.current > 1000) {
      lastStats.current = now;
      onStats({ level: 'level_b_3d', fps: governor.current.lastFps, triangles: bust.triangles });
    }
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#FFF6EE', '#6D5AE6', 0.5]} />
      <directionalLight position={[2.5, 3, 5]} intensity={1.5} />
      <directionalLight position={[-3, 2, -4]} intensity={0.6} color="#BFD7FF" />
      <primitive object={bust.root} />
    </>
  );
}
