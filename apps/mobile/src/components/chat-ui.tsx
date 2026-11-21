import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Presence } from '@anime/shared-types';
import type { ConnectionStatus } from '@/realtime/RealtimeClient';
import { colors } from './ui';

export function HeaderButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={{ paddingHorizontal: 6 }}
    >
      <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  left,
  onPress,
  onLongPress,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [s.row, pressed && onPress && { backgroundColor: colors.surface }]}
    >
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Avatar({ name, online }: { name: string; online?: boolean }) {
  return (
    <View>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
      </View>
      {online ? <View style={s.onlineDot} accessibilityLabel="online" /> : null}
    </View>
  );
}

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status === 'online') return null;
  return (
    <View style={s.banner} accessibilityLiveRegion="polite">
      <Text style={s.bannerText}>
        {status === 'connecting'
          ? 'Connecting…'
          : 'Offline. Messages will send when you reconnect.'}
      </Text>
    </View>
  );
}

export const SectionHeader = ({ children }: { children: string }) => (
  <Text style={s.section}>{children}</Text>
);

export function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function presenceLabel(p: Presence | undefined) {
  if (!p) return null;
  if (p.online) return 'online';
  if (!p.lastSeenAt) return null;
  const mins = Math.round((Date.now() - new Date(p.lastSeenAt).getTime()) / 60_000);
  if (mins < 1) return 'last seen just now';
  if (mins < 60) return `last seen ${mins}m ago`;
  if (mins < 24 * 60) return `last seen ${Math.round(mins / 60)}h ago`;
  return `last seen ${formatTime(p.lastSeenAt)}`;
}

export const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowSubtitle: { fontSize: 14, color: colors.muted },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2E9E5B',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.primaryText, fontSize: 12, fontWeight: '700' },
  banner: { backgroundColor: '#FFF4E0', paddingVertical: 8, paddingHorizontal: 16 },
  bannerText: { color: '#8A5A00', fontSize: 13 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
});
