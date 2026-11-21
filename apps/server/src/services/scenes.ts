import type { Pool } from 'pg';
import { SceneSchema, defaultCatalog, type Scene } from '@anime/scene-engine';
import type { SceneDropReason } from '@anime/shared-types';

/** Scenes in chat are small: at most the two members, and a few KB of JSON. */
export const MAX_SCENE_BYTES = 8 * 1024;
const MAX_CHAT_CHARACTERS = 2;

export interface SceneCheck {
  scene: Scene | null;
  dropped: SceneDropReason | null;
}

/**
 * Validates a client-supplied scene for a message. Never throws: anything wrong drops the
 * scene (the caller still stores the text).
 *
 *  - must match the scene schema (and at most 2 characters in a chat)
 *  - must be under MAX_SCENE_BYTES
 *  - a catalog scene above the age of any member is dropped (an 18+ scene never reaches a teen)
 *  - character avatar ids are rewritten to the sender and the other member, so a scene can't
 *    point at someone else's avatar
 */
export async function checkScene(
  pool: Pool,
  raw: unknown,
  senderId: string,
  members: string[],
): Promise<SceneCheck> {
  if (raw === undefined || raw === null) return { scene: null, dropped: null };

  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(raw), 'utf8');
  } catch {
    return { scene: null, dropped: 'invalid' };
  }
  if (size > MAX_SCENE_BYTES) return { scene: null, dropped: 'too_large' };

  const parsed = SceneSchema.safeParse(raw);
  if (!parsed.success || parsed.data.characters.length > MAX_CHAT_CHARACTERS) {
    return { scene: null, dropped: 'invalid' };
  }
  const scene = parsed.data;

  // Chat scenes must come from the catalog (so their age rating is known).
  const entry = scene.catalog_scene_id ? defaultCatalog().get(scene.catalog_scene_id) : undefined;
  if (!entry) return { scene: null, dropped: 'invalid' };
  {
    if (entry.min_age > 0) {
      const { rows } = await pool.query<{ teen: boolean }>(
        `SELECT bool_or(age_bracket = 'teen') AS teen FROM users WHERE id = ANY($1::uuid[])`,
        [members],
      );
      const youngest = rows[0]?.teen ? 13 : 18;
      if (entry.min_age > youngest) return { scene: null, dropped: 'age_restricted' };
    }
  }

  const peer = members.find((m) => m !== senderId) ?? senderId;
  scene.characters = scene.characters.map((c, i) => ({
    ...c,
    avatar_id: i === 0 ? senderId : peer,
    role: i === 0 ? 'sender' : 'recipient',
  }));
  return { scene, dropped: null };
}
