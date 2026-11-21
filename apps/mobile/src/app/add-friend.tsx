import { useCallback, useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import type { FriendQrResponse, SendFriendRequestResponse } from '@anime/shared-types';
import { useAuth } from '@/auth/AuthContext';
import { Body, Button, ErrorText, Field, Screen, Title, colors } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

/**
 * Two ways to add someone, for every age group: their exact username, or their QR code.
 * There is deliberately no search or suggestions.
 */
export default function AddFriend() {
  const { authedRequest, session } = useAuth();
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<{ token: string; expiresAt: number } | null>(null);

  const loadQr = useCallback(async () => {
    try {
      const r = await authedRequest<FriendQrResponse>('/friends/qr');
      setQr({ token: r.qrToken, expiresAt: Date.now() + r.expiresInSeconds * 1000 });
    } catch {
      setQr(null);
    }
  }, [authedRequest]);

  // Refresh the QR a minute before it expires.
  useEffect(() => {
    void loadQr();
  }, [loadQr]);
  useEffect(() => {
    if (!qr) return;
    const t = setTimeout(() => void loadQr(), Math.max(5_000, qr.expiresAt - Date.now() - 60_000));
    return () => clearTimeout(t);
  }, [qr, loadQr]);

  const send = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const r = await authedRequest<SendFriendRequestResponse>('/friends/requests', {
        method: 'POST',
        body: { username: username.trim() },
      });
      setResult(
        r.status === 'accepted'
          ? `You and ${r.user.username} are now friends.`
          : `Request sent to ${r.user.username}.`,
      );
      setUsername('');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title>Add by username</Title>
      <Body>Type their exact username.</Body>
      <Field label="Username" value={username} onChangeText={setUsername} autoComplete="off" />
      <ErrorText>{error}</ErrorText>
      {result ? <Text style={{ color: '#2E7D32' }}>{result}</Text> : null}
      <Button
        title="Send request"
        onPress={send}
        loading={loading}
        disabled={username.trim().length < 3}
      />

      <View style={{ height: 16 }} />
      <Title>Your QR code</Title>
      <Body>Friends can scan this to send you a request. It refreshes automatically.</Body>
      <View
        style={{
          alignItems: 'center',
          padding: 16,
          backgroundColor: colors.surface,
          borderRadius: 16,
        }}
      >
        {qr ? (
          <QRCode value={qr.token} size={200} backgroundColor={colors.surface} />
        ) : (
          <Text style={{ color: colors.muted }}>QR code unavailable offline.</Text>
        )}
        <Text style={{ marginTop: 12, color: colors.muted }}>@{session?.user.username}</Text>
      </View>
      {Platform.OS !== 'web' ? (
        <Button
          title="Scan a friend's QR code"
          variant="secondary"
          onPress={() => router.push('/scan')}
        />
      ) : null}
    </Screen>
  );
}
