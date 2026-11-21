import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title>Welcome back</Title>
      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        textContentType="username"
        autoComplete="username"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title="Log in"
        onPress={onSubmit}
        loading={loading}
        disabled={!username || !password}
      />
    </Screen>
  );
}
