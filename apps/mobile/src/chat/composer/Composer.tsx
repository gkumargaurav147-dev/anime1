import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Scene, SceneSuggestion } from '@anime/scene-engine';
import { colors } from '@/components/ui';
import type { AnimeMode } from '../animeMode';
import { PreviewSheet } from './PreviewSheet';
import { ScenePicker } from './ScenePicker';
import {
  defaultGenerate,
  pickScene,
  prepareScene,
  safeSuggest,
  sceneLabel,
  type AgeBracket,
  type Generate,
} from './sceneLogic';

export interface ComposerProps {
  mode: AnimeMode;
  ageBracket: AgeBracket;
  myId: string;
  peerId: string;
  /** Text is always sent; the scene is null when there is none (or it failed). */
  onSend: (text: string, scene: Scene | null) => void;
  renderScene: (scene: Scene, width: number) => ReactNode;
  /** Injected for tests; defaults to on-device suggestScene. */
  generate?: Generate;
  debounceMs?: number;
}

type Attached = { scene: Scene; from: 'auto' | 'user' } | null;

/**
 * Message composer: text box, anime button (catalog picker), a live suggestion chip while
 * typing, and the preview sheet. Long-press send = text only. Scene generation runs on the
 * device and can never block sending: any failure means "send the text".
 */
export function Composer({
  mode,
  ageBracket,
  myId,
  peerId,
  onSend,
  renderScene,
  generate = defaultGenerate,
  debounceMs = 250,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [suggestion, setSuggestion] = useState<SceneSuggestion | null>(null);
  const [attached, setAttached] = useState<Attached>(null);
  const [removed, setRemoved] = useState(false);
  const [intensity, setIntensity] = useState<1 | 2 | 3>(2);
  const [sheet, setSheet] = useState<null | 'send' | 'edit'>(null);
  const [picker, setPicker] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live suggestion while typing (debounced, on device).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (mode === 'off' || !text.trim()) {
      setSuggestion(null);
      if (!text.trim()) {
        setRemoved(false);
        setAttached((a) => (a?.from === 'user' ? a : null));
      }
      if (mode === 'off') setAttached((a) => (a?.from === 'user' ? a : null));
      return;
    }
    timer.current = setTimeout(() => {
      const s = safeSuggest(generate, text, ageBracket);
      setSuggestion(s);
      setAttached((a) => {
        if (a?.from === 'user') return a;
        // "On" attaches confident suggestions automatically (unless the user removed it).
        if (mode === 'on' && !removed && s?.scene && s.tier === 'auto')
          return { scene: s.scene, from: 'auto' };
        return null;
      });
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, mode, ageBracket, generate, debounceMs, removed]);

  const bubble = suggestion?.scene?.speech_bubble?.text ?? null;
  const alternatives = useMemo(
    () =>
      (suggestion?.alternatives ?? [])
        .map((a) => pickScene(a.scene_id, ageBracket, bubble))
        .filter((s): s is Scene => !!s),
    [suggestion, ageBracket, bubble],
  );

  const reset = () => {
    setText('');
    setSuggestion(null);
    setAttached(null);
    setRemoved(false);
    setIntensity(2);
    setSheet(null);
  };

  const deliver = (scene: Scene | null) => {
    const body = text.trim();
    if (!body) return;
    // prepareScene never throws, but a scene must never stop the text: guard anyway.
    const prepared = (() => {
      try {
        return prepareScene(scene, myId, peerId, intensity);
      } catch {
        return null;
      }
    })();
    onSend(body, prepared);
    reset();
  };

  const candidate =
    attached?.scene ?? (suggestion && suggestion.tier !== 'none' ? suggestion.scene : null);

  const onPressSend = () => {
    if (!text.trim()) return;
    if (mode === 'ask' && candidate && !removed) {
      if (!attached) setAttached({ scene: candidate, from: 'auto' });
      setSheet('send');
      return;
    }
    deliver(attached?.scene ?? null);
  };

  const openEdit = () => {
    if (!attached && candidate) setAttached({ scene: candidate, from: 'user' });
    setRemoved(false);
    setSheet('edit');
  };

  const chooseScene = (scene: Scene) => {
    setAttached({ scene, from: 'user' });
    setRemoved(false);
  };

  const showSuggestChip =
    !attached && !removed && suggestion?.scene && suggestion.tier !== 'none' && mode !== 'off';

  return (
    <View>
      {attached ? (
        // Two sibling buttons (a button inside a button is invalid on web).
        <View style={[s.chip, s.chipOn]}>
          <Pressable
            testID="scene-chip-attached"
            onPress={openEdit}
            accessibilityRole="button"
            accessibilityLabel={`Scene attached: ${sceneLabel(attached.scene)}. Tap to edit.`}
          >
            <Text style={s.chipOnText} numberOfLines={1}>
              ✨ {sceneLabel(attached.scene)} attached · Edit
            </Text>
          </Pressable>
          <Pressable
            testID="scene-chip-remove"
            onPress={() => {
              setAttached(null);
              setRemoved(true);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove scene"
          >
            <Text style={s.chipOnText}>✕</Text>
          </Pressable>
        </View>
      ) : showSuggestChip ? (
        <Pressable
          testID="scene-chip-suggest"
          onPress={openEdit}
          style={s.chip}
          accessibilityRole="button"
          accessibilityLabel={`Suggested scene: ${sceneLabel(suggestion.scene!)}`}
        >
          <Text style={s.chipText} numberOfLines={1}>
            ✨ Add “{sceneLabel(suggestion.scene!)}”?
          </Text>
        </Pressable>
      ) : null}

      <View style={s.row}>
        <Pressable
          testID="anime-button"
          onPress={() => setPicker(true)}
          style={s.animeBtn}
          accessibilityRole="button"
          accessibilityLabel="Pick an anime scene"
        >
          <Text style={{ fontSize: 18 }}>✨</Text>
        </Pressable>
        <TextInput
          testID="composer-input"
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={4000}
          accessibilityLabel="Message"
        />
        <Pressable
          testID="send-button"
          onPress={onPressSend}
          onLongPress={() => deliver(null)}
          delayLongPress={350}
          disabled={!text.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityHint="Long-press to send text only"
          style={[s.send, !text.trim() && { opacity: 0.4 }]}
        >
          <Text style={{ color: colors.primaryText, fontWeight: '700' }}>Send</Text>
        </Pressable>
      </View>

      <PreviewSheet
        visible={sheet !== null}
        purpose={sheet ?? 'edit'}
        text={text.trim()}
        scene={removed ? null : (attached?.scene ?? null)}
        alternatives={alternatives}
        intensity={intensity}
        onIntensity={setIntensity}
        onChoose={chooseScene}
        onPickAnother={() => setPicker(true)}
        onRemove={() => {
          setAttached(null);
          setRemoved(true);
        }}
        onSend={() => deliver(removed ? null : (attached?.scene ?? null))}
        onSendTextOnly={() => deliver(null)}
        onClose={() => setSheet(null)}
        renderScene={renderScene}
      />
      <ScenePicker
        visible={picker}
        ageBracket={ageBracket}
        onClose={() => setPicker(false)}
        onPick={(id) => {
          const scene = pickScene(id, ageBracket, bubble ?? (text.trim().slice(0, 24) || null));
          if (scene) chooseScene(scene);
          setPicker(false);
        }}
        renderThumb={renderScene}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  animeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  send: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginHorizontal: 10,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.bg,
  },
  chipText: { color: colors.primary, fontWeight: '600' },
  chipOn: { backgroundColor: colors.primary },
  chipOnText: { color: colors.primaryText, fontWeight: '600' },
});
