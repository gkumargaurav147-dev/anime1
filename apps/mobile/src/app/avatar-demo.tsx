import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { EXPRESSION_DEFS, GESTURES, type RendererLevel } from '@anime/scene-engine';
import { AvatarView } from '@/avatar/AvatarView';
import { Segmented, humanize } from '@/avatar/Segmented';
import { loadRendererPrefs, saveRendererPrefs } from '@/avatar/settings';
import type { AvatarStats } from '@/avatar/types';
import { useMyAvatar } from '@/avatar/useMyAvatar';
import { Button, colors } from '@/components/ui';

type Mode = 'expressions' | 'gestures' | 'combos';
const LEVELS = ['auto', 'level_a_svg', 'level_b_3d', 'fallback_static'] as const;
const LEVEL_LABEL: Record<(typeof LEVELS)[number], string> = {
  auto: 'Auto',
  level_a_svg: '2.5D',
  level_b_3d: '3D',
  fallback_static: 'Static',
};

/** Cycles through every expression and gesture on your avatar. */
export default function AvatarDemo() {
  const { avatar, avatarId } = useMyAvatar();
  const [mode, setMode] = useState<Mode>('expressions');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [intensity, setIntensity] = useState<1 | 2 | 3>(2);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('auto');
  const [framing, setFraming] = useState<'circle' | 'square'>('circle');
  const [stats, setStats] = useState<AvatarStats | null>(null);
  const [flag3d, setFlag3d] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    loadRendererPrefs().then((p) => setFlag3d(p.enable3d));
  }, []);

  const items =
    mode === 'expressions'
      ? EXPRESSION_DEFS.map((e) => ({
          label: e.id,
          sub: e.emotion,
          expr: e.id,
          gesture: null as string | null,
        }))
      : mode === 'gestures'
        ? GESTURES.map((g) => ({
            label: g.id,
            sub: `${g.duration_ms} ms${g.loop ? ' · loop' : ''}`,
            expr: 'smile',
            gesture: g.id,
          }))
        : EXPRESSION_DEFS.filter((e) => e.gesture).map((e) => ({
            label: `${e.id} + ${e.gesture}`,
            sub: e.emotion,
            expr: e.id,
            gesture: e.gesture,
          }));
  const item = items[index % items.length]!;

  useEffect(() => setIndex(0), [mode]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(
      () => setIndex((i) => (i + 1) % items.length),
      mode === 'expressions' ? 1600 : 2200,
    );
    return () => clearInterval(t);
  }, [playing, items.length, mode]);

  const onStats = useCallback((s: AvatarStats) => setStats(s), []);
  const toggle3d = async (v: boolean) => {
    setFlag3d(v);
    const prefs = await loadRendererPrefs();
    // Turning the flag on also clears any earlier automatic downgrade.
    await saveRendererPrefs({ ...prefs, enable3d: v, downgradedTo: null, failed: [] });
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        gap: 14,
        alignItems: 'stretch',
        backgroundColor: colors.bg,
      }}
    >
      <View style={{ alignItems: 'center', gap: 6 }}>
        <AvatarView
          key={`${level}-${flag3d}-${resetKey}`}
          config={avatar}
          avatarId={avatarId}
          expressionId={item.expr}
          gestureId={item.gesture}
          gestureKey={index}
          intensity={intensity}
          framing={framing}
          size={240}
          level={level as 'auto' | RendererLevel}
          onStats={onStats}
        />
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
          {humanize(item.label)}
        </Text>
        <Text style={{ color: colors.muted }}>
          {item.sub} · {(index % items.length) + 1}/{items.length}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {stats
            ? `${LEVEL_LABEL[stats.level === 'level_a_svg' ? 'level_a_svg' : stats.level === 'level_b_3d' ? 'level_b_3d' : 'fallback_static']} · ${stats.fps ?? '–'} fps${stats.triangles ? ` · ${stats.triangles} triangles` : ''}`
            : 'measuring…'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="◀ Prev"
            variant="secondary"
            onPress={() => setIndex((i) => (i - 1 + items.length) % items.length)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={playing ? 'Pause' : 'Play'} onPress={() => setPlaying((p) => !p)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Next ▶"
            variant="secondary"
            onPress={() => setIndex((i) => (i + 1) % items.length)}
          />
        </View>
      </View>

      <Label>Show</Label>
      <Segmented
        options={['expressions', 'gestures', 'combos'] as const}
        value={mode}
        onChange={setMode}
        label={humanize}
      />
      <Label>Intensity</Label>
      <Segmented options={[1, 2, 3] as const} value={intensity} onChange={setIntensity} />
      <Label>Renderer</Label>
      <Segmented options={LEVELS} value={level} onChange={setLevel} label={(l) => LEVEL_LABEL[l]} />
      <Label>Framing</Label>
      <Segmented
        options={['circle', 'square'] as const}
        value={framing}
        onChange={setFraming}
        label={humanize}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.text }}>3D prototype in Auto mode (feature flag)</Text>
        <Switch value={flag3d} onValueChange={toggle3d} />
      </View>
      <Button
        title="Reset automatic downgrade"
        variant="secondary"
        onPress={async () => {
          const prefs = await loadRendererPrefs();
          await saveRendererPrefs({ ...prefs, downgradedTo: null, failed: [] });
          setLevel('auto');
          setResetKey((k) => k + 1);
        }}
      />
    </ScrollView>
  );
}

const Label = ({ children }: { children: string }) => (
  <Text style={{ fontWeight: '700', color: colors.text, marginBottom: -6 }}>{children}</Text>
);
