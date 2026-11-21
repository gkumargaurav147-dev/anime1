import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { Scene } from '@anime/scene-engine';
import { Segmented, humanize } from '@/avatar/Segmented';
import { Button, colors } from '@/components/ui';
import { sceneLabel } from './sceneLogic';

/**
 * Preview before sending: see the scene, swap it (top-3 chips or the picker), change the
 * intensity, or remove it. In "send" mode it also has the send buttons.
 */
export function PreviewSheet({
  visible,
  purpose,
  text,
  scene,
  alternatives,
  intensity,
  onIntensity,
  onChoose,
  onPickAnother,
  onRemove,
  onSend,
  onSendTextOnly,
  onClose,
  renderScene,
}: {
  visible: boolean;
  purpose: 'send' | 'edit';
  text: string;
  scene: Scene | null;
  alternatives: Scene[];
  intensity: 1 | 2 | 3;
  onIntensity: (i: 1 | 2 | 3) => void;
  onChoose: (scene: Scene) => void;
  onPickAnother: () => void;
  onRemove: () => void;
  onSend: () => void;
  onSendTextOnly: () => void;
  onClose: () => void;
  renderScene: (scene: Scene, width: number) => ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
        <View
          testID="preview-sheet"
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 16,
            gap: 12,
            maxHeight: '90%',
          }}
        >
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
              {purpose === 'send' ? 'Send with a scene?' : 'Scene'}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            {scene ? (
              <View style={{ alignItems: 'center' }}>{renderScene(scene, 300)}</View>
            ) : (
              <Text
                testID="preview-no-scene"
                style={{ color: colors.muted, textAlign: 'center', padding: 24 }}
              >
                No scene: this message will be sent as text only.
              </Text>
            )}
            <Text style={{ color: colors.text, fontSize: 15 }} numberOfLines={3}>
              “{text}”
            </Text>

            {alternatives.length ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>Suggestions</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {alternatives.map((alt) => {
                    const active = alt.catalog_scene_id === scene?.catalog_scene_id;
                    return (
                      <Pressable
                        key={alt.catalog_scene_id}
                        testID={`alt-${alt.catalog_scene_id}`}
                        onPress={() => onChoose(alt)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 999,
                          borderWidth: 2,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary : colors.bg,
                        }}
                      >
                        <Text
                          style={{
                            color: active ? colors.primaryText : colors.text,
                            fontWeight: '600',
                          }}
                        >
                          ✨ {sceneLabel(alt)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Button title="Pick another scene…" variant="secondary" onPress={onPickAnother} />

            {scene ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>Intensity</Text>
                <Segmented
                  options={[1, 2, 3] as const}
                  value={intensity}
                  onChange={onIntensity}
                  label={(i) => ['Soft', 'Normal', 'Big'][i - 1]!}
                />
                <Pressable testID="remove-scene" onPress={onRemove} accessibilityRole="button">
                  <Text style={{ color: colors.danger, fontWeight: '600', paddingVertical: 6 }}>
                    Remove scene
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>

          {purpose === 'send' ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title="Text only" variant="secondary" onPress={onSendTextOnly} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title={scene ? 'Send with scene' : 'Send'} onPress={onSend} />
              </View>
            </View>
          ) : (
            <Button title="Done" onPress={onClose} />
          )}
        </View>
      </View>
    </Modal>
  );
}

export { humanize };
