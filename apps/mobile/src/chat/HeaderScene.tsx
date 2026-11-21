import { useMemo } from 'react';
import { View } from 'react-native';
import {
  EMOTION_TO_EXPRESSION,
  randomAvatar,
  suggestScene,
  type AvatarConfig,
  type Emotion,
} from '@anime/scene-engine';
import { AvatarView } from '@/avatar/AvatarView';
import { asScene } from '@/scenes/sceneSvg';

/** How each side reacts to the latest message's mood. */
const REACTION: Partial<Record<Emotion, { mine: string; theirs: string }>> = {
  happy: { mine: 'smile', theirs: 'grin' },
  excited: { mine: 'excited', theirs: 'grin_wide' },
  sad: { mine: 'sad', theirs: 'sympathetic' },
  angry: { mine: 'annoyed', theirs: 'worried' },
  love: { mine: 'in_love', theirs: 'blush_smile' },
  sorry: { mine: 'apologetic', theirs: 'sympathetic' },
  grateful: { mine: 'grateful', theirs: 'smile' },
  surprised: { mine: 'surprised', theirs: 'shocked' },
  tired: { mine: 'sleepy', theirs: 'yawn' },
  nervous: { mine: 'worried', theirs: 'sympathetic' },
};

/**
 * Mini scene in the chat header: both avatars, reacting to the mood of the latest message
 * (its scene's emotion, or an on-device guess from the text). Placeholder art for now.
 */
export function HeaderScene({
  myId,
  peerId,
  avatars,
  latest,
}: {
  myId: string;
  peerId: string;
  avatars: Record<string, AvatarConfig | undefined>;
  latest: { text: string; animeScene: unknown; senderId: string } | null;
}) {
  const mood = useMemo<Emotion>(() => {
    if (!latest) return 'neutral';
    const scene = asScene(latest.animeScene);
    if (scene) return scene.emotion;
    try {
      return suggestScene(latest.text).scene?.emotion ?? 'neutral';
    } catch {
      return 'neutral';
    }
  }, [latest]);

  const r = REACTION[mood];
  const base = EMOTION_TO_EXPRESSION[mood];
  const fromMe = latest?.senderId === myId;
  const mine = r ? (fromMe ? r.mine : r.theirs) : base;
  const theirs = r ? (fromMe ? r.theirs : r.mine) : base;

  return (
    <View style={{ flexDirection: 'row', marginRight: 4 }} accessibilityLabel={`Mood: ${mood}`}>
      <AvatarView
        config={avatars[myId] ?? randomAvatar(`avatar:${myId}`)}
        avatarId={myId}
        expressionId={mine}
        size={34}
        level="level_a_svg"
      />
      <View style={{ marginLeft: -8 }}>
        <AvatarView
          config={avatars[peerId] ?? randomAvatar(`avatar:${peerId}`)}
          avatarId={peerId}
          expressionId={theirs}
          size={34}
          level="level_a_svg"
        />
      </View>
    </View>
  );
}
