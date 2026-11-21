import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DeviceCaps, RendererLevel, RendererPrefs } from '@anime/scene-engine';

/**
 * Feature flag for the 3D (Level B) prototype. Off by default. Turn on with
 * EXPO_PUBLIC_AVATAR_3D=1 or the toggle on the avatar demo screen.
 */
export const AVATAR_3D_ENV = process.env.EXPO_PUBLIC_AVATAR_3D === '1';

const KEY = 'avatar.renderer.v1';

export async function loadRendererPrefs(): Promise<RendererPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<RendererPrefs>) : {};
    return {
      enable3d: saved.enable3d ?? AVATAR_3D_ENV,
      downgradedTo: saved.downgradedTo ?? null,
      failed: saved.failed ?? [],
    };
  } catch {
    return { enable3d: AVATAR_3D_ENV, downgradedTo: null, failed: [] };
  }
}

export async function saveRendererPrefs(prefs: RendererPrefs) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Preference only; rendering still works with defaults.
  }
}

export async function recordDowngrade(to: RendererLevel) {
  const prefs = await loadRendererPrefs();
  await saveRendererPrefs({ ...prefs, downgradedTo: to });
}

export async function recordFailure(level: RendererLevel) {
  const prefs = await loadRendererPrefs();
  await saveRendererPrefs({ ...prefs, failed: [...new Set([...(prefs.failed ?? []), level])] });
}

function hasWebGL() {
  if (Platform.OS !== 'web') return true; // expo-gl provides GL on iOS/Android
  try {
    const c = (globalThis as { document?: Document }).document?.createElement('canvas');
    return !!(c?.getContext('webgl2') ?? c?.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Rough device class. Without a native benchmark module we assume 'mid'; the frame-rate
 * governor then downgrades automatically if this device can't hold 30 fps.
 */
export function deviceCaps(): DeviceCaps {
  const platform =
    Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
      ? Platform.OS
      : 'web';
  return { platform, webgl: hasWebGL(), tier: 'mid' };
}
