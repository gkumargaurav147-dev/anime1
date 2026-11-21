import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Platform, View } from 'react-native';
import { Stack, router } from 'expo-router';
import type { Friend, FriendRequestsResponse, FriendsResponse } from '@anime/shared-types';
import { useAuth } from '@/auth/AuthContext';
import { useChat } from '@/chat/ChatContext';
import { Avatar, CountBadge, HeaderButton, ListRow, presenceLabel } from '@/components/chat-ui';
import { Body, ErrorText, colors } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

function choose(
  title: string,
  options: { text: string; destructive?: boolean; onPress: () => void }[],
) {
  if (Platform.OS === 'web') {
    // Web has no action sheet; fall back to sequential confirms.
    for (const o of options) if (globalThis.confirm?.(`${title}: ${o.text}?`)) return o.onPress();
    return;
  }
  Alert.alert(title, undefined, [
    ...options.map((o) => ({
      text: o.text,
      style: o.destructive ? ('destructive' as const) : ('default' as const),
      onPress: o.onPress,
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

export default function Friends() {
  const { authedRequest } = useAuth();
  const { presence, friendsVersion } = useChat();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([
        authedRequest<FriendsResponse>('/friends'),
        authedRequest<FriendRequestsResponse>('/friends/requests'),
      ]);
      setFriends(f.friends);
      setIncoming(r.requests.filter((x) => x.direction === 'incoming').length);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not load friends.');
    }
  }, [authedRequest]);

  useEffect(() => {
    void load();
  }, [load, friendsVersion]);

  const act = async (path: string, method: 'DELETE' | 'POST', body?: unknown) => {
    try {
      await authedRequest(path, { method, body });
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    }
  };

  const manage = (f: Friend) =>
    choose(f.username, [
      {
        text: 'Remove friend',
        destructive: true,
        onPress: () => void act(`/friends/${f.id}`, 'DELETE'),
      },
      {
        text: 'Block',
        destructive: true,
        onPress: () => void act('/blocks', 'POST', { userId: f.id }),
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderButton title="Add" onPress={() => router.push('/add-friend')} />
          ),
        }}
      />
      <FlatList
        data={friends}
        keyExtractor={(f) => f.id}
        ListHeaderComponent={
          <>
            <ListRow
              title="Friend requests"
              right={<CountBadge count={incoming} />}
              onPress={() => router.push('/requests')}
            />
            <View style={{ paddingHorizontal: 16 }}>
              <ErrorText>{error}</ErrorText>
            </View>
          </>
        }
        renderItem={({ item: f }) => (
          <ListRow
            left={<Avatar name={f.username} online={presence[f.id]?.online} />}
            title={f.username}
            subtitle={presenceLabel(presence[f.id])}
            right={<HeaderButton title="•••" onPress={() => manage(f)} />}
            onPress={() =>
              router.push({ pathname: '/chat/[id]', params: { id: f.conversationId } })
            }
            onLongPress={() => manage(f)}
          />
        )}
        ListEmptyComponent={
          <View style={{ padding: 24 }}>
            <Body>No friends yet. Tap Add to send a request by username or QR code.</Body>
          </View>
        }
      />
    </View>
  );
}
