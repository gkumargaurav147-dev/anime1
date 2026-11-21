import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ConversationSummary, Message } from '@anime/shared-types';
import { useChat } from '@/chat/ChatContext';
import type { OutboxItem } from '@/chat/localStore';
import { ConnectionBanner, formatTime, presenceLabel } from '@/components/chat-ui';
import { colors } from '@/components/ui';

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
  const [text, setText] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);

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

  const onSend = () => {
    if (!id || !text.trim()) return;
    void chat.sendText(id, text);
    setText('');
  };

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
            return (
              <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
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
        ) : (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Message"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={4000}
              accessibilityLabel="Message"
            />
            <Pressable
              onPress={onSend}
              disabled={!text.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={[styles.send, !text.trim() && { opacity: 0.4 }]}
            >
              <Text style={{ color: colors.primaryText, fontWeight: '700' }}>Send</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
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
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  send: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  cannotSend: { padding: 16, textAlign: 'center', color: colors.muted },
});
