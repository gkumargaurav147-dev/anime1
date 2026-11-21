import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

/**
 * Neutral age screen: asks for a date of birth with empty fields and never mentions a
 * minimum age, so there is nothing to "aim for". Only the birth year is kept server-side.
 */
export default function AgeGate() {
  const { submitAgeGate, localBlockedUntil } = useAuth();
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // A device that was blocked recently goes straight to the blocked screen.
  useEffect(() => {
    localBlockedUntil().then((until) => {
      if (until) router.replace('/blocked');
    });
  }, [localBlockedUntil]);

  const onContinue = async () => {
    const m = Number(month);
    const d = Number(day);
    const y = Number(year);
    if (!Number.isInteger(m) || !Number.isInteger(d) || !Number.isInteger(y) || year.length !== 4) {
      setError('Please enter a valid date.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await submitAgeGate({ birthMonth: m, birthDay: d, birthYear: y });
      if (result.ok) router.push('/signup');
      else router.replace('/blocked');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title>When's your birthday?</Title>
      <Body>We use this to set up your account. We only keep your birth year.</Body>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Month"
            placeholder="MM"
            keyboardType="number-pad"
            maxLength={2}
            value={month}
            onChangeText={setMonth}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Day"
            placeholder="DD"
            keyboardType="number-pad"
            maxLength={2}
            value={day}
            onChangeText={setDay}
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <Field
            label="Year"
            placeholder="YYYY"
            keyboardType="number-pad"
            maxLength={4}
            value={year}
            onChangeText={setYear}
          />
        </View>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button
        title="Continue"
        onPress={onContinue}
        loading={loading}
        disabled={!month || !day || !year}
      />
    </Screen>
  );
}
