import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

function confirm(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === 'web')
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function Settings() {
  const { session, logout, logoutAll, deleteAccount } = useAuth();
  const [busy, setBusy] = useState<null | 'logout' | 'all' | 'delete'>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
      setBusy(null);
    }
  };

  const onDelete = async () => {
    const ok = await confirm(
      'Delete account?',
      'This permanently deletes your account and all of its data. This cannot be undone.',
      'Delete',
    );
    if (ok) await run('delete', () => deleteAccount(password));
  };

  return (
    <Screen>
      <Body>Signed in as {session?.user.username}</Body>

      <View style={{ gap: 12 }}>
        <Button
          title="Log out"
          variant="secondary"
          loading={busy === 'logout'}
          onPress={() => run('logout', logout)}
        />
        <Button
          title="Log out of all devices"
          variant="secondary"
          loading={busy === 'all'}
          onPress={() => run('all', logoutAll)}
        />
      </View>

      <View style={{ gap: 12, marginTop: 24 }}>
        <Title>Delete account</Title>
        <Body>Removes your account, sessions, devices and everything linked to you.</Body>
        <Field
          label="Confirm your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
        />
        <Button
          title="Delete my account"
          variant="danger"
          loading={busy === 'delete'}
          disabled={!password}
          onPress={onDelete}
        />
      </View>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
