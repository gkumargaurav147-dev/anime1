import { Pressable, ScrollView, Text, View } from 'react-native';
import { colors } from '@/components/ui';

/** Small pill selector used by the avatar screens. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  swatches,
  scroll,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label?: (v: T) => string;
  /** Optional colour per option (shown as a swatch instead of text). */
  swatches?: Partial<Record<string, string>>;
  scroll?: boolean;
}) {
  const items = options.map((o) => {
    const active = o === value;
    const swatch = swatches?.[String(o)];
    return (
      <Pressable
        key={String(o)}
        onPress={() => onChange(o)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label ? label(o) : String(o)}
        style={{
          paddingHorizontal: swatch ? 4 : 12,
          paddingVertical: swatch ? 4 : 7,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active && !swatch ? colors.primary : colors.bg,
          marginRight: 6,
          marginBottom: 6,
        }}
      >
        {swatch ? (
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: swatch }} />
        ) : (
          <Text
            style={{
              color: active ? colors.primaryText : colors.text,
              fontWeight: '600',
              fontSize: 13,
            }}
          >
            {label ? label(o) : String(o)}
          </Text>
        )}
      </Pressable>
    );
  });
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {items}
    </ScrollView>
  ) : (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{items}</View>
  );
}

export const humanize = (s: string | number) =>
  String(s)
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
