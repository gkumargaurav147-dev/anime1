import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MeResponse } from '@anime/shared-types';
import type { AppDeps } from '../app';
import { AppError } from '../errors';
import { hmacSha256, randomDigits, safeEqualHex } from '../lib/crypto';
import { authRateLimit } from '../lib/rate-limit';
import { USER_COLUMNS, toPublicUser, type UserRow } from '../services/sessions';

const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'must be in E.164 format, e.g. +14155550123');

/**
 * Phone verification for a signed-in user. Codes go out through the SmsProvider interface
 * (dev stub logs them) and are stored only as HMACs.
 */
export const otpRoutes = (deps: AppDeps) => async (app: FastifyInstance) => {
  const { config, pool, sms } = deps;
  const opts = { config: authRateLimit(config), preHandler: app.requireAuth };
  const codeHash = (userId: string, phone: string, code: string) =>
    hmacSha256(config.JWT_ACCESS_SECRET, `otp:${userId}:${phone}:${code}`);

  app.post('/auth/otp/request', opts, async (req, reply) => {
    const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
    const userId = req.auth!.userId;

    const taken = await pool.query('SELECT 1 FROM users WHERE phone_e164 = $1 AND id <> $2', [
      phone,
      userId,
    ]);
    if (taken.rowCount) throw new AppError(409, 'PHONE_TAKEN', 'That number is already in use.');

    const code = randomDigits(6);
    // Only the latest code is valid.
    await pool.query('DELETE FROM otp_codes WHERE user_id = $1', [userId]);
    await pool.query(
      `INSERT INTO otp_codes (user_id, phone_e164, code_hash, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
      [userId, phone, codeHash(userId, phone, code), OTP_TTL_SECONDS],
    );
    await sms.send(phone, `Your verification code is ${code}`);
    return reply.status(202).send({ expiresInSeconds: OTP_TTL_SECONDS });
  });

  app.post('/auth/otp/verify', opts, async (req) => {
    const { phone, code } = z
      .object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) })
      .parse(req.body);
    const userId = req.auth!.userId;

    const { rows } = await pool.query<{
      id: string;
      code_hash: string;
      attempts: number;
      expired: boolean;
    }>(
      `SELECT id, code_hash, attempts, expires_at <= now() AS expired FROM otp_codes
        WHERE user_id = $1 AND phone_e164 = $2 AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [userId, phone],
    );
    const otp = rows[0];
    if (!otp || otp.expired || otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AppError(400, 'OTP_EXPIRED', 'That code has expired. Request a new one.');
    }
    if (!safeEqualHex(otp.code_hash, codeHash(userId, phone, code))) {
      await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
      throw new AppError(400, 'OTP_INVALID', 'That code is not right.');
    }

    try {
      await pool.query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [otp.id]);
      const user = await pool.query<UserRow>(
        `UPDATE users SET phone_e164 = $2, phone_verified_at = now(), updated_at = now()
          WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [userId, phone],
      );
      const res: MeResponse = { user: toPublicUser(user.rows[0]!) };
      return res;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError(409, 'PHONE_TAKEN', 'That number is already in use.');
      }
      throw err;
    }
  });
};
