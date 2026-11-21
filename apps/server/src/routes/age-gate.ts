import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgeGateResponse } from '@anime/shared-types';
import type { AppDeps } from '../app';
import { authRateLimit } from '../lib/rate-limit';
import { AppError } from '../errors';
import { MIN_AGE, bracketForAge, computeAge } from '../lib/age';
import { AGE_TOKEN_TTL_SECONDS, signAgeToken } from '../lib/tokens';
import { requireDeviceHash } from '../plugins/auth';

const bodySchema = z.object({
  birthYear: z.number().int().min(1900).max(2100),
  birthMonth: z.number().int().min(1).max(12),
  birthDay: z.number().int().min(1).max(31),
});

// Deliberately neutral: does not reveal the threshold, so it can't be "solved" by retrying.
const BLOCKED_MESSAGE = "Sorry, you can't create an account right now.";

export const ageGateRoutes = (deps: AppDeps) => async (app: FastifyInstance) => {
  const { config, pool } = deps;

  app.post('/age-gate', { config: authRateLimit(config) }, async (req) => {
    const dh = requireDeviceHash(req);

    // 1. A device in cooldown is blocked no matter what age is entered now.
    const existing = await pool.query<{ retry: number }>(
      `SELECT CEIL(EXTRACT(EPOCH FROM blocked_until - now()))::int AS retry
         FROM age_gate_blocks WHERE device_hash = $1 AND blocked_until > now()`,
      [dh],
    );
    if (existing.rows[0]) {
      throw new AppError(403, 'AGE_BLOCKED', BLOCKED_MESSAGE, {
        retryAfterSeconds: existing.rows[0].retry,
      });
    }

    const { birthYear, birthMonth, birthDay } = bodySchema.parse(req.body);
    const result = computeAge(birthYear, birthMonth, birthDay);
    if (!result.ok) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Please enter a valid date of birth.');
    }

    // 2. Under the minimum age: start a device-level cooldown.
    if (result.age < MIN_AGE) {
      const cooldownSeconds = Math.round(config.AGE_GATE_COOLDOWN_HOURS * 3600);
      await pool.query(
        `INSERT INTO age_gate_blocks (device_hash, blocked_until)
         VALUES ($1, now() + make_interval(secs => $2))
         ON CONFLICT (device_hash) DO UPDATE SET blocked_until = EXCLUDED.blocked_until`,
        [dh, cooldownSeconds],
      );
      throw new AppError(403, 'AGE_BLOCKED', BLOCKED_MESSAGE, {
        retryAfterSeconds: cooldownSeconds,
      });
    }

    // 3. Passed: issue a short-lived token bound to this device. Only year + bracket go in it.
    const ageBracket = bracketForAge(result.age);
    const response: AgeGateResponse = {
      ageToken: signAgeToken(config.JWT_ACCESS_SECRET, { by: birthYear, br: ageBracket, dh }),
      ageBracket,
      expiresInSeconds: AGE_TOKEN_TTL_SECONDS,
    };
    return response;
  });
};
