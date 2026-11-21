import { useCallback, useEffect, useState } from 'react';
import { SectionList, View } from 'react-native';
import type { FriendRequest, FriendRequestsResponse } from '@anime/shared-types';
import { useAuth } from '@/auth/AuthContext';
import { useChat } from '@/chat/ChatContext';
import { Avatar, HeaderButton, ListRow, SectionHeader, formatTime } from '@/components/chat-ui';
import { Body, ErrorText, colors } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

export default function Requests() {
  const { authedRequest } = useAuth();
  const { friendsVersion } = useChat();
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests((await authedRequest<FriendRequestsResponse>('/friends/requests')).requests);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not load requests.');
    }
  }, [authedRequest]);

  useEffect(() => {
    void load();
  }, [load, friendsVersion]);

  const act = async (path: string, method: 'POST' | 'DELETE') => {
    setError(null);
    try {
      await authedRequest(path, { method });
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    }
  };

  const sections = [
    { title: 'Received', data: requests.filter((r) => r.direction === 'incoming') },
    { title: 'Sent', data: requests.filter((r) => r.direction === 'outgoing') },
  ].filter((s) => s.data.length);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: 16 }}>
        <ErrorText>{error}</ErrorText>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.user.id}
        renderSectionHeader={({ section }) => <SectionHeader>{section.title}</SectionHeader>}
        renderItem={({ item: r }) => (
          <ListRow
            left={<Avatar name={r.user.username} />}
            title={r.user.username}
            subtitle={formatTime(r.createdAt)}
            right={
              r.direction === 'incoming' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <HeaderButton
                    title="Accept"
                    onPress={() => void act(`/friends/requests/${r.user.id}/accept`, 'POST')}
                  />
                  <HeaderButton
                    title="Decline"
                    onPress={() => void act(`/friends/requests/${r.user.id}`, 'DELETE')}
                  />
                </View>
              ) : (
                <HeaderButton
                  title="Cancel"
                  onPress={() => void act(`/friends/requests/${r.user.id}`, 'DELETE')}
                />
              )
            }
          />
        )}
        ListEmptyComponent={
          <View style={{ padding: 24 }}>
            <Body>No pending requests.</Body>
          </View>
        }
      />
    </View>
  );
}
