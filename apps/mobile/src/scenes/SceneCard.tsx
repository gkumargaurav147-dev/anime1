import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { AvatarConfig, Scene } from '@anime/scene-engine';
import { colors } from '@/components/ui';
import { sceneToSvg } from './sceneSvg';

/** Renders nothing if anything inside throws: the message text must always show. */
class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface Props {
  scene: Scene;
  avatars: Record<string, AvatarConfig | undefined>;
  width: number;
  /** Message id (cache key). */
  id?: string;
  /** Tap = replay the entrance animation; the expand button calls this. */
  onEnlarge?: () => void;
  /** Change to replay. */
  replayKey?: number;
}

function SceneCardInner({ scene, avatars, width, id, onEnlarge, replayKey = 0 }: Props) {
  const svg = useMemo(() => sceneToSvg(scene, avatars, id), [scene, avatars, id]);
  const height = (width * 300) / 400;
  const pop = useRef(new Animated.Value(0)).current;

  const replay = () => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  };
  useEffect(replay, [replayKey]);

  // The replay area and the enlarge button are siblings (no button inside a button on web).
  return (
    <View>
      <Pressable
        onPress={replay}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Anime scene: ${scene.catalog_scene_id ?? 'scene'}. Tap to replay.`}
      >
        <Animated.View
          style={{
            width,
            height,
            borderRadius: 14,
            overflow: 'hidden',
            opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          }}
        >
          <SvgXml xml={svg} width={width} height={height} />
        </Animated.View>
      </Pressable>
      {onEnlarge ? (
        <Pressable
          onPress={onEnlarge}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Enlarge scene"
          style={{
            position: 'absolute',
            right: 6,
            top: 6,
            backgroundColor: 'rgba(0,0,0,0.35)',
            borderRadius: 10,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
        >
          <Text style={{ color: colors.primaryText, fontSize: 13 }}>⤢</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Scene card for a message. If the scene can't render, it renders nothing (text still shows). */
export function SceneCard(props: Props) {
  return (
    <SilentBoundary>
      <View>
        <SceneCardInner {...props} />
      </View>
    </SilentBoundary>
  );
}
