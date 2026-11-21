import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

export default function Signup() {
  const { signup, ageToken } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Signup requires passing the age gate first.
  useEffect(() => {
    if (!ageToken) router.replace('/age-gate');
  }, [ageToken]);

  const onSubmit = async () => {
    if (password !== confirm) return setError("Passwords don't match.");
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setError(null);
    setLoading(true);
    try {
      await signup(username.trim(), password);
      // The protected stack moves us to Home once the session exists.
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'AGE_TOKEN_INVALID') {
        router.replace('/age-gate');
        return;
      }
      if (e instanceof ApiRequestError && e.code === 'AGE_BLOCKED') {
        router.replace('/blocked');
        return;
      }
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title>Create your account</Title>
      <Body>3–20 characters: letters, numbers and underscores.</Body>
      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        textContentType="username"
        autoComplete="username-new"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
      />
      <Field
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        textContentType="newPassword"
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title="Create account"
        onPress={onSubmit}
        loading={loading}
        disabled={!username || !password || !confirm}
      />
    </Screen>
  );
}
