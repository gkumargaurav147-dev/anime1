import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { allowedScenes, sceneFromCatalog, type Category, type Scene } from '@anime/scene-engine';
import { Segmented, humanize } from '@/avatar/Segmented';
import { colors } from '@/components/ui';
import { pickerStore } from '@/scenes/pickerStore';
import type { AgeBracket } from './sceneLogic';

type Tab = 'recents' | 'favorites' | Category;

/**
 * Catalog picker: categories, search, recents and favourites. Only scenes allowed for the
 * user's age are listed (romance is never shown to teens).
 */
export function ScenePicker({
  visible,
  ageBracket,
  onPick,
  onClose,
  renderThumb,
}: {
  visible: boolean;
  ageBracket: AgeBracket;
  onPick: (sceneId: string) => void;
  onClose: () => void;
  renderThumb: (scene: Scene, width: number) => ReactNode;
}) {
  const scenes = useMemo(() => allowedScenes({ ageBracket }), [ageBracket]);
  const categories = useMemo(() => [...new Set(scenes.map((s) => s.category))], [scenes]);
  const [tab, setTab] = useState<Tab>('recents');
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    void pickerStore.recents().then((r) => {
      setRecents(r);
      if (!r.length) setTab((t) => (t === 'recents' ? 'food_and_drink' : t));
    });
    void pickerStore.favorites().then(setFavorites);
  }, [visible]);

  const q = query.trim().toLowerCase();
  const list = scenes.filter((s) => {
    if (q)
      return (
        s.scene_id.includes(q.replace(/\s+/g, '_')) ||
        s.category.includes(q) ||
        s.tags.some((t) => t.includes(q))
      );
    if (tab === 'recents') return recents.includes(s.scene_id);
    if (tab === 'favorites') return favorites.includes(s.scene_id);
    return s.category === tab;
  });
  if (!q && tab === 'recents')
    list.sort((a, b) => recents.indexOf(a.scene_id) - recents.indexOf(b.scene_id));

  const pick = (id: string) => {
    void pickerStore.addRecent(id);
    onPick(id);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
        <View
          testID="scene-picker"
          style={{
            marginTop: 60,
            flex: 1,
            backgroundColor: colors.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 16,
            gap: 10,
          }}
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
              Pick a scene
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            testID="picker-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search scenes (dinner, beach, hug…)"
            placeholderTextColor={colors.muted}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 9,
              color: colors.text,
            }}
            autoCapitalize="none"
          />
          {!q ? (
            <Segmented
              scroll
              options={['recents', 'favorites', ...categories] as Tab[]}
              value={tab}
              onChange={setTab}
              label={(t) =>
                t === 'recents' ? 'Recent' : t === 'favorites' ? '★ Favourites' : humanize(t)
              }
            />
          ) : null}
          <FlatList
            data={list}
            numColumns={3}
            keyExtractor={(s) => s.scene_id}
            initialNumToRender={9}
            windowSize={5}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={{ color: colors.muted, padding: 16 }}>
                {tab === 'favorites' && !q
                  ? 'Tap ☆ on a scene to save it here.'
                  : tab === 'recents' && !q
                    ? 'Scenes you use show up here.'
                    : 'No scenes found.'}
              </Text>
            }
            renderItem={({ item }) => {
              const scene = sceneFromCatalog(item.scene_id, { ageBracket, bubbleText: null });
              const fav = favorites.includes(item.scene_id);
              return (
                <View style={{ flex: 1 / 3 }}>
                  <Pressable
                    testID={`pick-${item.scene_id}`}
                    onPress={() => pick(item.scene_id)}
                    accessibilityRole="button"
                    accessibilityLabel={humanize(item.scene_id)}
                  >
                    {scene ? renderThumb(scene, 104) : null}
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 12, color: colors.text, marginTop: 2 }}
                    >
                      {humanize(item.scene_id)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      void pickerStore.toggleFavorite(item.scene_id).then(setFavorites)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'}
                    style={{ position: 'absolute', right: 4, top: 4 }}
                    hitSlop={6}
                  >
                    <Text style={{ fontSize: 16, color: fav ? '#F5B301' : '#FFFFFF' }}>
                      {fav ? '★' : '☆'}
                    </Text>
                  </Pressable>
                </View>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
