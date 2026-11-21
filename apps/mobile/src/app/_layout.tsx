import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
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
        <Stack.Screen name="home" options={{ title: 'Home', headerBackVisible: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootStack />
    </AuthProvider>
  );
}
