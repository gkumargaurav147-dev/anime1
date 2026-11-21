import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  ACCENT_PALETTE,
  AVATAR_OPTIONS,
  EYE_PALETTE,
  HAIR_PALETTE,
  SKIN_PALETTE,
  randomAvatar,
  type AvatarConfig,
  type AvatarPart,
} from '@anime/scene-engine';
import { AvatarView } from '@/avatar/AvatarView';
import { Segmented, humanize } from '@/avatar/Segmented';
import { useMyAvatar } from '@/avatar/useMyAvatar';
import { Button, ErrorText, colors } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

const TABS: { id: string; label: string; parts: AvatarPart[] }[] = [
  { id: 'face', label: 'Face', parts: ['skinTone', 'faceShape', 'nose', 'mouth', 'marks'] },
  { id: 'eyes', label: 'Eyes', parts: ['eyeShape', 'eyeColor', 'eyebrows', 'glasses'] },
  { id: 'hair', label: 'Hair', parts: ['hairStyle', 'hairColor', 'facialHair'] },
  { id: 'style', label: 'Style', parts: ['outfit', 'collar', 'accentColor', 'earrings'] },
];

const SWATCHES: Partial<Record<AvatarPart, Record<string, string>>> = {
  skinTone: Object.fromEntries(Object.entries(SKIN_PALETTE).map(([k, v]) => [k, v[0]])),
  hairColor: Object.fromEntries(Object.entries(HAIR_PALETTE).map(([k, v]) => [k, v[0]])),
  eyeColor: Object.fromEntries(Object.entries(EYE_PALETTE).map(([k, v]) => [k, v[0]])),
  accentColor: Object.fromEntries(Object.entries(ACCENT_PALETTE).map(([k, v]) => [k, v[0]])),
};

const PART_LABEL: Record<AvatarPart, string> = {
  faceShape: 'Face shape',
  skinTone: 'Skin tone',
  eyeShape: 'Eye shape',
  eyeColor: 'Eye colour',
  eyebrows: 'Eyebrows',
  nose: 'Nose',
  mouth: 'Mouth',
  hairStyle: 'Hair style',
  hairColor: 'Hair colour',
  marks: 'Freckles & marks',
  facialHair: 'Facial hair',
  earrings: 'Earrings',
  glasses: 'Glasses',
  outfit: 'Outfit',
  collar: 'Collar',
  accentColor: 'Accent colour',
};

/** Avatar creator: live animated preview, every part editable, randomize, save. */
export default function AvatarCreator() {
  const { avatar, save, avatarId, saved: wasSaved } = useMyAvatar();
  const [draft, setDraft] = useState<AvatarConfig>(avatar);
  const [tab, setTab] = useState('face');
  const [framing, setFraming] = useState<'circle' | 'square'>('circle');
  const [react, setReact] = useState<{ expr: string; gesture: string | null; key: number }>({
    expr: 'smile',
    gesture: null,
    key: 0,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDraft(avatar), [avatar]);

  // A small reaction after each change so the preview feels alive.
  const flash = (expr: string, gesture: string | null = null) => {
    setReact((r) => ({ expr, gesture, key: r.key + 1 }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setReact((r) => ({ ...r, expr: 'smile', gesture: null })),
      1600,
    );
  };

  const setPart = (part: AvatarPart, value: string) => {
    setDraft((d) => ({ ...d, [part]: value }) as AvatarConfig);
    setMessage(null);
    flash(part === 'glasses' || part === 'hairStyle' ? 'proud' : 'grin');
  };

  const onRandomize = () => {
    setDraft(randomAvatar(`${Date.now()}-${Math.random()}`));
    setMessage(null);
    flash('excited', 'wave');
  };

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await save(draft);
      setMessage('Saved! Friends will see this avatar.');
      flash('ecstatic', 'thumbs_up');
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ alignItems: 'center', paddingTop: 12, gap: 8 }}>
        <AvatarView
          config={draft}
          avatarId={avatarId}
          expressionId={react.expr}
          gestureId={react.gesture}
          gestureKey={react.key}
          framing={framing}
          size={220}
        />
        <Segmented
          options={['circle', 'square'] as const}
          value={framing}
          onChange={setFraming}
          label={humanize}
        />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Segmented
          options={TABS.map((t) => t.id)}
          value={tab}
          onChange={setTab}
          label={(id) => TABS.find((t) => t.id === id)!.label}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {current.parts.map((part) => (
          <View key={part} style={{ gap: 6 }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{PART_LABEL[part]}</Text>
            <Segmented
              options={AVATAR_OPTIONS[part] as readonly string[]}
              value={draft[part] as string}
              onChange={(v) => setPart(part, v)}
              label={humanize}
              swatches={SWATCHES[part]}
            />
          </View>
        ))}
      </ScrollView>

      <View style={{ padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
        {message ? <Text style={{ color: '#2E7D32' }}>{message}</Text> : null}
        <ErrorText>{error}</ErrorText>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button title="Randomize" variant="secondary" onPress={onRandomize} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title={wasSaved ? 'Save changes' : 'Save avatar'}
              onPress={onSave}
              loading={busy}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
