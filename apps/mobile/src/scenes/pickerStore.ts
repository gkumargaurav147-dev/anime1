import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENTS = 'scenes.recents';
const FAVORITES = 'scenes.favorites';
const MAX_RECENTS = 12;

async function read(key: string): Promise<string[]> {
  try {
    const v = await AsyncStorage.getItem(key);
    const parsed = v ? (JSON.parse(v) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
async function write(key: string, ids: string[]) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // preference only
  }
}

export const pickerStore = {
  recents: () => read(RECENTS),
  favorites: () => read(FAVORITES),
  async addRecent(id: string) {
    const list = (await read(RECENTS)).filter((x) => x !== id);
    await write(RECENTS, [id, ...list].slice(0, MAX_RECENTS));
  },
  async toggleFavorite(id: string) {
    const list = await read(FAVORITES);
    const next = list.includes(id) ? list.filter((x) => x !== id) : [id, ...list];
    await write(FAVORITES, next);
    return next;
  },
};
