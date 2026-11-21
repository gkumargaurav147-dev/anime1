import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { useChat } from '@/chat/ChatContext';
import { AvatarView } from '@/avatar/AvatarView';
import { useMyAvatar } from '@/avatar/useMyAvatar';
import { localStore } from '@/chat/localStore';
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
  const auth = useAuth();
  const { session, deleteAccount } = auth;
  const chat = useChat();
  const me = useMyAvatar();

  /** Logging out wipes this device's chat cache, so warn if anything is still unsent. */
  const leave = async (fn: () => Promise<void>) => {
    const unsent = chat.outbox.length;
    if (
      unsent > 0 &&
      !(await confirm(
        'Unsent messages',
        `${unsent} message(s) haven't been sent yet and will be lost if you log out now.`,
        'Log out anyway',
      ))
    ) {
      return;
    }
    await chat.resetLocalData();
    await fn();
  };
  const logout = () => leave(auth.logout);
  const logoutAll = () => leave(auth.logoutAll);
  const deleteAndWipe = async (password: string) => {
    const uid = session?.user.id;
    await deleteAccount(password);
    if (uid) await localStore.clear(uid);
  };
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
    if (ok) await run('delete', () => deleteAndWipe(password));
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 8 }}>
        {/* Profile picture: the same avatar as in scenes, as a still frame. */}
        <AvatarView
          config={me.avatar}
          avatarId={me.avatarId}
          expressionId="smile"
          size={120}
          animated={false}
          level="fallback_static"
        />
        <Body>
          Signed in as {session?.user.username} ·{' '}
          {session?.user.isTeen ? 'Teen account' : 'Adult account'}
        </Body>
      </View>

      <View style={{ gap: 12 }}>
        <Button title="Edit avatar" onPress={() => router.push('/avatar-creator')} />
        <Button
          title="Avatar expressions demo"
          variant="secondary"
          onPress={() => router.push('/avatar-demo')}
        />
        <Button
          title="Blocked users"
          variant="secondary"
          onPress={() => router.push('/blocked-users')}
        />
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
