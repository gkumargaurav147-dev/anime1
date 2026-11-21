import { View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Screen, Title } from '@/components/ui';

export default function Welcome() {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12, paddingTop: 80 }}>
        <Title>Welcome</Title>
        <Body>Create an account or log in to get started.</Body>
      </View>
      <View style={{ gap: 12 }}>
        <Button title="Create account" onPress={() => router.push('/age-gate')} />
        <Button title="Log in" variant="secondary" onPress={() => router.push('/login')} />
      </View>
    </Screen>
  );
}
