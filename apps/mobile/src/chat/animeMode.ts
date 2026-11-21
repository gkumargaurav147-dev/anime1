import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-chat anime setting (stored on this device):
 *  - on:   a confident suggestion is attached automatically; tap send to send it
 *  - ask:  tapping send opens the preview sheet whenever there is a scene
 *  - off:  no suggestions (the anime button still lets you pick one by hand)
 */
export type AnimeMode = 'on' | 'ask' | 'off';
export const ANIME_MODES: AnimeMode[] = ['on', 'ask', 'off'];
export const ANIME_MODE_LABEL: Record<AnimeMode, string> = {
  on: 'Anime on',
  ask: 'Ask each time',
  off: 'Anime off',
};

const key = (conversationId: string) => `anime.mode.${conversationId}`;

export async function loadAnimeMode(conversationId: string): Promise<AnimeMode> {
  try {
    const v = await AsyncStorage.getItem(key(conversationId));
    return v === 'on' || v === 'ask' || v === 'off' ? v : 'on';
  } catch {
    return 'on';
  }
}

export async function saveAnimeMode(conversationId: string, mode: AnimeMode) {
  try {
    await AsyncStorage.setItem(key(conversationId), mode);
  } catch {
    // preference only
  }
}
