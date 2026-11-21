import { View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Screen, Title } from '@/components/ui';

export default function Blocked() {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Title>Sorry</Title>
        <Body>You can't create an account right now.</Body>
      </View>
      <Button title="Back" variant="secondary" onPress={() => router.replace('/')} />
    </Screen>
  );
}
