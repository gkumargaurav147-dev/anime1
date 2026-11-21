import { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import type { BlocksResponse, UserSummary } from '@anime/shared-types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, HeaderButton, ListRow } from '@/components/chat-ui';
import { Body, ErrorText, colors } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

export default function BlockedUsers() {
  const { authedRequest } = useAuth();
  const [blocked, setBlocked] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBlocked((await authedRequest<BlocksResponse>('/blocks')).blocked);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not load.');
    }
  }, [authedRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = async (id: string) => {
    try {
      await authedRequest(`/blocks/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: 16 }}>
        <ErrorText>{error}</ErrorText>
      </View>
      <FlatList
        data={blocked}
        keyExtractor={(u) => u.id}
        renderItem={({ item: u }) => (
          <ListRow
            left={<Avatar name={u.username} />}
            title={u.username}
            right={<HeaderButton title="Unblock" onPress={() => void unblock(u.id)} />}
          />
        )}
        ListEmptyComponent={
          <View style={{ padding: 24 }}>
            <Body>You haven't blocked anyone.</Body>
          </View>
        }
      />
    </View>
  );
}
