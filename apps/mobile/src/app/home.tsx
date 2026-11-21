import { useEffect } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useChat } from '@/chat/ChatContext';
import {
  Avatar,
  ConnectionBanner,
  CountBadge,
  HeaderButton,
  ListRow,
  formatTime,
} from '@/components/chat-ui';
import { Body, Button, colors } from '@/components/ui';

/** Chat list: one row per conversation, newest activity first. */
export default function Chats() {
  const { conversations, presence, status, myUserId, outbox, refreshConversations } = useChat();

  useEffect(() => {
    void refreshConversations().catch(() => {});
  }, [refreshConversations]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <HeaderButton title="Settings" onPress={() => router.push('/settings')} />
          ),
          headerRight: () => (
            <HeaderButton title="Friends" onPress={() => router.push('/friends')} />
          ),
        }}
      />
      <ConnectionBanner status={status} />
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        renderItem={({ item: c }) => {
          const queued = outbox.filter((o) => o.conversationId === c.id).at(-1);
          const last = queued
            ? { text: queued.text, mine: true, at: queued.createdAt }
            : c.lastMessage
              ? {
                  text: c.lastMessage.text,
                  mine: c.lastMessage.senderId === myUserId,
                  at: c.lastMessage.createdAt,
                }
              : null;
          return (
            <ListRow
              left={<Avatar name={c.peer.username} online={presence[c.peer.id]?.online} />}
              title={c.peer.username}
              subtitle={last ? `${last.mine ? 'You: ' : ''}${last.text}` : 'Say hi 👋'}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {last ? (
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{formatTime(last.at)}</Text>
                  ) : null}
                  <CountBadge count={c.unreadCount} />
                </View>
              }
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
            />
          );
        }}
        ListEmptyComponent={
          <View style={{ padding: 24, gap: 16 }}>
            <Body>No chats yet. Add a friend to start talking.</Body>
            <Button title="Add a friend" onPress={() => router.push('/add-friend')} />
          </View>
        }
      />
    </View>
  );
}
