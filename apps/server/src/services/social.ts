import type { Pool, PoolClient } from 'pg';
import type { UserSummary } from '@anime/shared-types';

type Db = Pool | PoolClient;

/** Friendships and direct conversations store an unordered pair as (low, high). */
export const orderPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export async function findUserByUsername(db: Db, username: string) {
  const { rows } = await db.query<UserSummary & { age_bracket: string }>(
    'SELECT id, username, age_bracket FROM users WHERE lower(username) = lower($1)',
    [username],
  );
  return rows[0] ?? null;
}

export async function findUserById(db: Db, id: string): Promise<UserSummary | null> {
  const { rows } = await db.query<UserSummary>('SELECT id, username FROM users WHERE id = $1', [
    id,
  ]);
  return rows[0] ?? null;
}

/** True if either user has blocked the other. */
export async function isBlockedEitherWay(db: Db, a: string, b: string) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM blocks
      WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [a, b],
  );
  return !!rowCount;
}

export async function getFriendship(db: Db, a: string, b: string) {
  const [low, high] = orderPair(a, b);
  const { rows } = await db.query<{ status: 'pending' | 'accepted'; requested_by: string }>(
    'SELECT status, requested_by FROM friendships WHERE user_low = $1 AND user_high = $2',
    [low, high],
  );
  return rows[0] ?? null;
}

export async function areFriends(db: Db, a: string, b: string) {
  return (await getFriendship(db, a, b))?.status === 'accepted';
}

/** May `a` and `b` exchange messages right now? */
export async function canMessage(db: Db, a: string, b: string) {
  return (await areFriends(db, a, b)) && !(await isBlockedEitherWay(db, a, b));
}

export async function getFriendIds(db: Db, userId: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT CASE WHEN user_low = $1 THEN user_high ELSE user_low END AS id
       FROM friendships WHERE (user_low = $1 OR user_high = $1) AND status = 'accepted'`,
    [userId],
  );
  return rows.map((r) => r.id);
}

/** Returns the single direct conversation for a pair, creating it if needed. */
export async function ensureDirectConversation(db: Db, a: string, b: string): Promise<string> {
  const [low, high] = orderPair(a, b);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO conversations (kind, direct_key) VALUES ('direct', $1)
     ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key
     RETURNING id`,
    [`${low}:${high}`],
  );
  const id = rows[0]!.id;
  await db.query(
    `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)
     ON CONFLICT DO NOTHING`,
    [id, low, high],
  );
  return id;
}

/**
 * Discovery policy. Nobody can browse or search for strangers today: the only ways to find
 * someone are an exact username or their QR code. Teens must stay on exactly that path, so
 * any future search/suggestion feature has to check this first.
 */
export function canUseStrangerDiscovery(ageBracket: string) {
  return ageBracket === 'adult';
}
