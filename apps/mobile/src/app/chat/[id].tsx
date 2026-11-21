import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Scene } from '@anime/scene-engine';
import type { ConversationSummary, Message } from '@anime/shared-types';
import { useAuth } from '@/auth/AuthContext';
import { useAvatars } from '@/avatar/AvatarsContext';
import {
  ANIME_MODES,
  ANIME_MODE_LABEL,
  loadAnimeMode,
  saveAnimeMode,
  type AnimeMode,
} from '@/chat/animeMode';
import { useChat } from '@/chat/ChatContext';
import { Composer } from '@/chat/composer/Composer';
import { HeaderScene } from '@/chat/HeaderScene';
import type { OutboxItem } from '@/chat/localStore';
import { ConnectionBanner, formatTime, presenceLabel } from '@/components/chat-ui';
import { colors } from '@/components/ui';
import { SceneCard } from '@/scenes/SceneCard';
import { asScene } from '@/scenes/sceneSvg';

type Row =
  | { kind: 'message'; key: string; message: Message }
  | { kind: 'pending'; key: string; item: OutboxItem };

/** ✓ sent · ✓✓ delivered · blue ✓✓ seen · 🕓 waiting to send · ! failed */
function Ticks({ row, conv }: { row: Row; conv: ConversationSummary | undefined }) {
  if (row.kind === 'pending') {
    return row.item.failedReason ? (
      <Text style={[styles.tick, { color: colors.danger }]}>!</Text>
    ) : (
      <Text style={styles.tick} accessibilityLabel="sending">
        🕓
      </Text>
    );
  }
  const { seq, status } = row.message;
  const seen = status === 'seen' || (conv ? seq <= conv.peerSeenUpTo : false);
  const delivered =
    seen || status === 'delivered' || (conv ? seq <= conv.peerDeliveredUpTo : false);
  return (
    <Text
      style={[styles.tick, seen && styles.tickSeen]}
      accessibilityLabel={seen ? 'seen' : delivered ? 'delivered' : 'sent'}
    >
      {delivered ? '✓✓' : '✓'}
    </Text>
  );
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chat = useChat();
  const { conversations, messages, outbox, presence, myUserId, hasOlder, status } = chat;
  const conv = conversations.find((c) => c.id === id);
  const { session } = useAuth();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [mode, setMode] = useState<AnimeMode>('on');
  const [enlarged, setEnlarged] = useState<Scene | null>(null);
  const { width } = useWindowDimensions();
  const peerId = conv?.peer.id ?? '';
  const avatars = useAvatars(myUserId && peerId ? [myUserId, peerId] : []);

  useEffect(() => {
    if (id) void loadAnimeMode(id).then(setMode);
  }, [id]);
  const cycleMode = () => {
    const next = ANIME_MODES[(ANIME_MODES.indexOf(mode) + 1) % ANIME_MODES.length]!;
    setMode(next);
    if (id) void saveAnimeMode(id, next);
  };

  // Run once per conversation (the chat object changes on every message).
  useEffect(() => {
    if (id) void chat.openConversation(id);
  }, [id]);

  // Mark as seen while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      chat.setActiveConversation(id ?? null);
      return () => chat.setActiveConversation(null);
    }, [id]),
  );

  // Newest first because the list is inverted.
  const rows = useMemo<Row[]>(() => {
    const pending: Row[] = outbox
      .filter((o) => o.conversationId === id)
      .map((item) => ({ kind: 'pending', key: item.clientMessageId, item }));
    const sent: Row[] = (messages[id ?? ''] ?? []).map((m) => ({
      kind: 'message',
      key: m.id,
      message: m,
    }));
    return [...sent, ...pending].reverse();
  }, [messages, outbox, id]);

  const onSend = (text: string, scene: Scene | null) => {
    if (!id || !text.trim()) return;
    void chat.sendText(id, text, scene as unknown as Record<string, unknown> | null);
  };

  const latest = useMemo(() => {
    const m = rows.find((r) => r.kind === 'message');
    if (m?.kind === 'message') return m.message;
    const p = rows[0];
    return p?.kind === 'pending'
      ? { text: p.item.text, animeScene: p.item.animeScene ?? null, senderId: myUserId ?? '' }
      : null;
  }, [rows, myUserId]);

  const cardWidth = Math.min(260, width * 0.66);

  const onEndReached = async () => {
    if (!id || loadingOlder || !hasOlder[id]) return;
    setLoadingOlder(true);
    await chat.loadOlder(id).catch(() => {});
    setLoadingOlder(false);
  };

  const subtitle = conv ? presenceLabel(presence[conv.peer.id]) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
                {conv?.peer.username ?? ''}
              </Text>
              {subtitle ? (
                <Text style={{ fontSize: 12, color: colors.muted }}>{subtitle}</Text>
              ) : null}
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {myUserId && peerId ? (
                <HeaderScene myId={myUserId} peerId={peerId} avatars={avatars} latest={latest} />
              ) : null}
              <Pressable
                testID="anime-mode"
                onPress={cycleMode}
                accessibilityRole="button"
                accessibilityLabel={`${ANIME_MODE_LABEL[mode]}. Tap to change.`}
                style={styles.modeBtn}
              >
                <Text style={styles.modeText}>
                  {mode === 'on' ? '✨ On' : mode === 'ask' ? '✨ Ask' : '✨ Off'}
                </Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <ConnectionBanner status={status} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          inverted
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          renderItem={({ item: row }) => {
            const mine = row.kind === 'pending' || row.message.senderId === myUserId;
            const body = row.kind === 'pending' ? row.item.text : row.message.text;
            const at = row.kind === 'pending' ? row.item.createdAt : row.message.createdAt;
            const failed = row.kind === 'pending' ? row.item.failedReason : undefined;
            // Invalid / unrenderable scenes are simply skipped: the text always shows.
            const scene = asScene(
              row.kind === 'pending' ? row.item.animeScene : row.message.animeScene,
            );
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  {scene ? (
                    <View style={{ marginBottom: 6 }}>
                      <SceneCard
                        scene={scene}
                        avatars={avatars}
                        width={cardWidth}
                        id={row.key}
                        onEnlarge={() => setEnlarged(scene)}
                      />
                    </View>
                  ) : null}
                  <Text style={[styles.text, mine && { color: colors.primaryText }]}>{body}</Text>
                  <View style={styles.meta}>
                    <Text style={[styles.time, mine && { color: '#E4E0FF' }]}>
                      {formatTime(at)}
                    </Text>
                    {mine ? <Ticks row={row} conv={conv} /> : null}
                  </View>
                </View>
                {failed && row.kind === 'pending' ? (
                  <View style={styles.failedRow}>
                    <Text style={styles.failedText}>Not sent: {failed}</Text>
                    <Pressable onPress={() => chat.retry(row.item.clientMessageId)}>
                      <Text style={styles.failedAction}>Retry</Text>
                    </Pressable>
                    <Pressable onPress={() => chat.discard(row.item.clientMessageId)}>
                      <Text style={styles.failedAction}>Delete</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
        {conv && !conv.canSend ? (
          <Text style={styles.cannotSend}>
            You can't send messages here because you're no longer friends.
          </Text>
        ) : myUserId && peerId ? (
          <Composer
            mode={mode}
            ageBracket={session?.user.ageBracket ?? 'teen'}
            myId={myUserId}
            peerId={peerId}
            onSend={onSend}
            renderScene={(s, w) => <SceneCard scene={s} avatars={avatars} width={w} />}
          />
        ) : null}
      </KeyboardAvoidingView>

      <Modal
        visible={!!enlarged}
        transparent
        animationType="fade"
        onRequestClose={() => setEnlarged(null)}
      >
        <Pressable
          style={styles.enlargeBackdrop}
          onPress={() => setEnlarged(null)}
          accessibilityRole="button"
          accessibilityLabel="Close scene"
        >
          {enlarged ? (
            <SceneCard scene={enlarged} avatars={avatars} width={Math.min(width - 32, 560)} />
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  text: { fontSize: 16, color: colors.text },
  meta: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 },
  time: { fontSize: 11, color: colors.muted },
  tick: { fontSize: 11, color: '#E4E0FF' },
  // Must stand out against the purple "mine" bubble.
  tickSeen: { color: '#7DF9FF', fontWeight: '700' },
  failedRow: { flexDirection: 'row', gap: 12, marginTop: 2 },
  failedText: { fontSize: 12, color: colors.danger },
  failedAction: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  modeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modeText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  enlargeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cannotSend: { padding: 16, textAlign: 'center', color: colors.muted },
});
