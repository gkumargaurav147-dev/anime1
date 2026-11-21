import {
  AvatarDirectory,
  PlaceholderAssetProvider,
  SceneSchema,
  composeScene,
  renderSvg,
  type AvatarConfig,
  type Scene,
} from '@anime/scene-engine';

const assets = new PlaceholderAssetProvider();
const cache = new Map<string, string>();

/** Parses an untrusted message payload into a Scene, or null (never throws). */
export function asScene(raw: unknown): Scene | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = SceneSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Renders a scene to an SVG string on the device, with the members' real avatars. Cached by
 * `cacheKey` (message id) + avatar versions, so a chat full of scenes renders each once.
 */
export function sceneToSvg(
  scene: Scene,
  avatars: Record<string, AvatarConfig | undefined>,
  cacheKey?: string,
): string {
  const ids = scene.characters.map((c) => c.avatar_id);
  const key = cacheKey
    ? `${cacheKey}|${ids.map((id) => (avatars[id] ? JSON.stringify(avatars[id]) : id)).join('|')}`
    : null;
  if (key) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const directory = new AvatarDirectory();
  for (const id of ids) {
    const cfg = avatars[id];
    if (cfg) directory.set(id, cfg);
  }
  const svg = renderSvg(composeScene(scene, assets, { avatars: directory }));
  if (key) {
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(key, svg);
  }
  return svg;
}
