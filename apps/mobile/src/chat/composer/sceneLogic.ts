import {
  sceneFromCatalog,
  suggestScene,
  type Scene,
  type SceneSuggestion,
} from '@anime/scene-engine';

export type AgeBracket = 'teen' | 'adult';
export type Generate = (text: string, ageBracket: AgeBracket) => SceneSuggestion;

/** On-device generation (Level 1 rules). Nothing leaves the phone. */
export const defaultGenerate: Generate = (text, ageBracket) => suggestScene(text, { ageBracket });

/** Runs generation but never throws: a failure just means "no suggestion". */
export function safeSuggest(generate: Generate, text: string, ageBracket: AgeBracket) {
  try {
    if (!text.trim()) return null;
    return generate(text, ageBracket);
  } catch {
    return null;
  }
}

/** A catalog scene by id (picker / alternative chips), age-gated, keeping the bubble text. */
export function pickScene(sceneId: string, ageBracket: AgeBracket, bubbleText: string | null) {
  try {
    return sceneFromCatalog(sceneId, { ageBracket, bubbleText });
  } catch {
    return null;
  }
}

/**
 * Final touches before sending: the characters become the two chat members and the chosen
 * intensity is applied. Returns null if anything goes wrong (the text is sent regardless).
 */
export function prepareScene(
  scene: Scene | null,
  myId: string,
  peerId: string,
  intensity: 1 | 2 | 3,
): Scene | null {
  if (!scene) return null;
  try {
    return {
      ...scene,
      characters: scene.characters.slice(0, 2).map((c, i) => ({
        ...c,
        avatar_id: i === 0 ? myId : peerId,
        intensity,
      })),
    };
  } catch {
    return null;
  }
}

export const sceneLabel = (scene: Scene) =>
  (scene.catalog_scene_id ?? 'scene').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
