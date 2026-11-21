import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { SendFriendRequestResponse } from '@anime/shared-types';
import { useAuth } from '@/auth/AuthContext';
import { Body, Button, Screen, Title, colors } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

export default function Scan() {
  const { authedRequest } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Screen>
        <Title>Camera access</Title>
        <Body>The camera is only used to scan a friend's QR code.</Body>
        <Button title="Allow camera" onPress={() => void requestPermission()} />
      </Screen>
    );
  }

  const onScanned = async (data: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await authedRequest<SendFriendRequestResponse>('/friends/requests', {
        method: 'POST',
        body: { qrToken: data },
      });
      setMessage(
        r.status === 'accepted'
          ? `You and ${r.user.username} are now friends.`
          : `Request sent to ${r.user.username}.`,
      );
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      setMessage(e instanceof ApiRequestError ? e.message : 'That code did not work.');
      // Let them try again after a moment.
      setTimeout(() => {
        busy.current = false;
      }, 2000);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => void onScanned(data)}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>{message ?? "Point at your friend's QR code"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: colors.primaryText,
    borderRadius: 24,
  },
  hint: {
    color: colors.primaryText,
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
