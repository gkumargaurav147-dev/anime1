import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { Body, Button, Screen, Title, colors } from '@/components/ui';

export default function Home() {
  const { session } = useAuth();
  if (!session) return null;
  const { user } = session;

  return (
    <Screen>
      <Title>Hi, {user.username}</Title>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 4,
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: '600' }}>
            {user.isTeen ? 'Teen account' : 'Adult account'}
          </Text>
        </View>
      </View>
      <Body>You're signed in.</Body>
      <View style={{ flex: 1 }} />
      <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} />
    </Screen>
  );
}
