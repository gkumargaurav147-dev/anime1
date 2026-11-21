import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bg: '#FFFFFF',
  text: '#16141F',
  muted: '#6B6880',
  primary: '#5B4BDB',
  primaryText: '#FFFFFF',
  border: '#DAD8E6',
  danger: '#C62828',
  surface: '#F5F4FA',
};

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const Title = ({ children }: { children: ReactNode }) => (
  <Text style={styles.title} accessibilityRole="header">
    {children}
  </Text>
);

export const Body = ({ children }: { children: ReactNode }) => (
  <Text style={styles.body}>{children}</Text>
);

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        {...props}
      />
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && { backgroundColor: colors.danger },
        (pressed || isDisabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.primaryText} />
      ) : (
        <Text style={[styles.buttonText, variant === 'secondary' && { color: colors.primary }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export const ErrorText = ({ children }: { children?: string | null }) =>
  children ? (
    <Text style={styles.error} accessibilityLiveRegion="polite">
      {children}
    </Text>
  ) : null;

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, gap: 16, flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 22, color: colors.muted },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  secondary: { borderWidth: 1, borderColor: colors.primary, backgroundColor: 'transparent' },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14 },
});
