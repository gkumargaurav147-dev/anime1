import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthResponse } from '@anime/shared-types';
import type { AppDeps } from '../app';
import { AppError } from '../errors';
import { sha256 } from '../lib/crypto';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../lib/password';
import { authRateLimit } from '../lib/rate-limit';
import { verifyAgeToken } from '../lib/tokens';
import { deviceHash, requireDeviceHash } from '../plugins/auth';
import {
  USER_COLUMNS,
  createSession,
  toPublicUser,
  upsertDevice,
  type UserRow,
} from '../services/sessions';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'must be at least 3 characters')
  .max(20, 'must be at most 20 characters')
  .regex(/^[A-Za-z0-9_]+$/, 'may only contain letters, numbers and underscores');

export const passwordSchema = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(128, 'must be at most 128 characters');

const signupSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  ageToken: z.string().min(1),
});

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1).max(256) });

const platformOf = (ua: unknown) => (typeof ua === 'string' ? ua.slice(0, 64) : undefined);

export const authRoutes = (deps: AppDeps) => async (app: FastifyInstance) => {
  const { config, pool } = deps;
  const rl = { config: authRateLimit(config) };

  app.post('/auth/signup', rl, async (req, reply) => {
    const dh = requireDeviceHash(req);
    const body = signupSchema.parse(req.body);

    const age = verifyAgeToken(config.JWT_ACCESS_SECRET, body.ageToken);
    if (!age || age.dh !== dh) {
      throw new AppError(400, 'AGE_TOKEN_INVALID', 'Please confirm your date of birth again.');
    }
    // A device that hit the age block after getting a token still can't sign up.
    const blocked = await pool.query(
      'SELECT 1 FROM age_gate_blocks WHERE device_hash = $1 AND blocked_until > now()',
      [dh],
    );
    if (blocked.rowCount) {
      throw new AppError(403, 'AGE_BLOCKED', "Sorry, you can't create an account right now.");
    }

    const passwordHash = await hashPassword(body.password);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (username, birth_year, age_bracket) VALUES ($1, $2, $3)
         RETURNING ${USER_COLUMNS}`,
        [body.username, age.by, age.br],
      );
      const user = rows[0]!;
      await client.query('INSERT INTO credentials (user_id, password_hash) VALUES ($1, $2)', [
        user.id,
        passwordHash,
      ]);
      const deviceId = await upsertDevice(
        client,
        user.id,
        dh,
        platformOf(req.headers['user-agent']),
      );
      const tokens = await createSession(client, config, user.id, deviceId);
      await client.query('COMMIT');
      const res: AuthResponse = { ...tokens, user: toPublicUser(user) };
      return reply.status(201).send(res);
    } catch (err) {
      await client.query('ROLLBACK');
      if ((err as { code?: string }).code === '23505') {
        throw new AppError(409, 'USERNAME_TAKEN', 'That username is taken.');
      }
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/auth/login', rl, async (req) => {
    const body = loginSchema.parse(req.body);
    const { rows } = await pool.query<UserRow & { password_hash: string }>(
      `SELECT u.id, u.username, u.age_bracket, u.phone_verified_at, u.created_at, c.password_hash
         FROM users u JOIN credentials c ON c.user_id = u.id
        WHERE lower(u.username) = lower($1)`,
      [body.username],
    );
    const row = rows[0];
    if (!row) {
      await burnPasswordCheck(body.password);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong username or password.');
    }
    if (!(await verifyPassword(row.password_hash, body.password))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong username or password.');
    }
    const deviceId = await upsertDevice(
      pool,
      row.id,
      deviceHash(req),
      platformOf(req.headers['user-agent']),
    );
    const tokens = await createSession(pool, config, row.id, deviceId);
    const res: AuthResponse = { ...tokens, user: toPublicUser(row) };
    return res;
  });

  /**
   * Rotating refresh: the presented session is revoked ('rotated') and a new one issued.
   * Presenting an already-rotated token means it was copied, so every session is revoked.
   */
  app.post('/auth/refresh', rl, async (req) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const invalid = () =>
      new AppError(401, 'REFRESH_TOKEN_INVALID', 'Session expired. Please sign in again.');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{
        id: string;
        user_id: string;
        device_id: string | null;
        revoked_reason: string | null;
        expired: boolean;
      }>(
        `SELECT id, user_id, device_id, revoked_reason, expires_at <= now() AS expired
           FROM sessions WHERE refresh_token_hash = $1 FOR UPDATE`,
        [sha256(refreshToken)],
      );
      const session = rows[0];
      if (!session) throw invalid();
      if (session.revoked_reason === 'rotated') {
        await client.query(
          `UPDATE sessions SET revoked_at = now(), revoked_reason = 'reuse_detected'
            WHERE user_id = $1 AND revoked_at IS NULL`,
          [session.user_id],
        );
        await client.query('COMMIT');
        throw invalid();
      }
      if (session.revoked_reason || session.expired) throw invalid();

      await client.query(
        `UPDATE sessions SET revoked_at = now(), revoked_reason = 'rotated', last_used_at = now()
          WHERE id = $1`,
        [session.id],
      );
      const tokens = await createSession(client, config, session.user_id, session.device_id);
      const user = await client.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
        session.user_id,
      ]);
      await client.query('COMMIT');
      const res: AuthResponse = { ...tokens, user: toPublicUser(user.rows[0]!) };
      return res;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/auth/logout', { ...rl, preHandler: app.requireAuth }, async (req, reply) => {
    await pool.query(
      `UPDATE sessions SET revoked_at = now(), revoked_reason = 'logout'
        WHERE id = $1 AND revoked_at IS NULL`,
      [req.auth!.sessionId],
    );
    return reply.status(204).send();
  });

  app.post('/auth/logout-all', { ...rl, preHandler: app.requireAuth }, async (req, reply) => {
    await pool.query(
      `UPDATE sessions SET revoked_at = now(), revoked_reason = 'logout_all'
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [req.auth!.userId],
    );
    return reply.status(204).send();
  });
};
