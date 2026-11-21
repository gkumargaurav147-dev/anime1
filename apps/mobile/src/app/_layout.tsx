import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { ChatProvider } from '@/chat/ChatContext';
import { colors } from '@/components/ui';

function RootStack() {
  const { ready, session } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const signedIn = !!session;
  return (
    <Stack screenOptions={{ headerTintColor: colors.primary, headerShadowVisible: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="age-gate" options={{ title: '' }} />
        <Stack.Screen name="signup" options={{ title: 'Create account' }} />
        <Stack.Screen name="login" options={{ title: 'Log in' }} />
        <Stack.Screen name="blocked" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="home" options={{ title: 'Chats', headerBackVisible: false }} />
        <Stack.Screen name="friends" options={{ title: 'Friends' }} />
        <Stack.Screen name="requests" options={{ title: 'Requests' }} />
        <Stack.Screen name="add-friend" options={{ title: 'Add friend' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan QR code' }} />
        <Stack.Screen name="chat/[id]" options={{ title: '' }} />
        <Stack.Screen name="blocked-users" options={{ title: 'Blocked users' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ChatProvider>
        <StatusBar style="dark" />
        <RootStack />
      </ChatProvider>
    </AuthProvider>
  );
}
