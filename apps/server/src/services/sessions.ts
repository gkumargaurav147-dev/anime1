import type { PoolClient, Pool } from 'pg';
import type { AuthTokens, PublicUser, AgeBracket } from '@anime/shared-types';
import type { Config } from '../config';
import { randomToken, sha256 } from '../lib/crypto';
import { signAccessToken } from '../lib/tokens';

type Db = Pool | PoolClient;

export interface UserRow {
  id: string;
  username: string;
  age_bracket: AgeBracket;
  phone_verified_at: Date | null;
  created_at: Date;
}

export const USER_COLUMNS = 'id, username, age_bracket, phone_verified_at, created_at';

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  username: u.username,
  ageBracket: u.age_bracket,
  isTeen: u.age_bracket === 'teen',
  phoneVerified: u.phone_verified_at !== null,
  createdAt: u.created_at.toISOString(),
});

/** Records (or touches) the device a user signs in from. Returns the devices.id. */
export async function upsertDevice(db: Db, userId: string, dh: string | null, platform?: string) {
  if (!dh) return null;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO devices (user_id, device_hash, platform) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, device_hash)
       DO UPDATE SET last_seen_at = now(), platform = COALESCE(EXCLUDED.platform, devices.platform)
     RETURNING id`,
    [userId, dh, platform ?? null],
  );
  return rows[0]!.id;
}

/** Creates a session row and returns a fresh access + refresh token pair for it. */
export async function createSession(
  db: Db,
  config: Config,
  userId: string,
  deviceId: string | null,
): Promise<AuthTokens> {
  const refreshToken = randomToken();
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO sessions (user_id, device_id, refresh_token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))
     RETURNING id`,
    [userId, deviceId, sha256(refreshToken), config.REFRESH_TOKEN_TTL_DAYS],
  );
  const accessToken = signAccessToken(config.JWT_ACCESS_SECRET, config.ACCESS_TOKEN_TTL_SECONDS, {
    sub: userId,
    sid: rows[0]!.id,
  });
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresInSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
  };
}
