import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MeResponse } from '@anime/shared-types';
import type { AppDeps } from '../app';
import { AppError, unauthorized } from '../errors';
import { verifyPassword } from '../lib/password';
import { authRateLimit } from '../lib/rate-limit';
import { USER_COLUMNS, toPublicUser, type UserRow } from '../services/sessions';

const deleteSchema = z.object({ password: z.string().min(1).max(256) });

export const meRoutes = (deps: AppDeps) => async (app: FastifyInstance) => {
  const { config, pool } = deps;

  app.get('/me', { preHandler: app.requireAuth }, async (req) => {
    const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
      req.auth!.userId,
    ]);
    if (!rows[0]) throw unauthorized();
    const res: MeResponse = { user: toPublicUser(rows[0]) };
    return res;
  });

  /**
   * Permanently deletes the account. Every table holding user data references users(id)
   * with ON DELETE CASCADE (credentials, devices, sessions, otp_codes, reports), so a single
   * DELETE removes all of it atomically.
   */
  app.delete(
    '/me',
    { config: authRateLimit(config), preHandler: app.requireAuth },
    async (req, reply) => {
      const { password } = deleteSchema.parse(req.body);
      const userId = req.auth!.userId;
      const { rows } = await pool.query<{ password_hash: string }>(
        'SELECT password_hash FROM credentials WHERE user_id = $1',
        [userId],
      );
      if (!rows[0] || !(await verifyPassword(rows[0].password_hash, password))) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong password.');
      }
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      return reply.status(204).send();
    },
  );
};
