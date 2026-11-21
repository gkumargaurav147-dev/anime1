import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app';
import { AppError, unauthorized } from '../errors';
import { sha256 } from '../lib/crypto';
import { verifyAccessToken } from '../lib/tokens';

export const DEVICE_ID_HEADER = 'x-device-id';
const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,128}$/;

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: string; sessionId: string };
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest) => Promise<void>;
  }
}

/** Hash of the client's device id, or null when absent/malformed. Raw ids are never stored. */
export function deviceHash(req: FastifyRequest): string | null {
  const raw = req.headers[DEVICE_ID_HEADER];
  if (typeof raw !== 'string' || !DEVICE_ID_RE.test(raw)) return null;
  return sha256(`device:${raw}`);
}

export function requireDeviceHash(req: FastifyRequest): string {
  const dh = deviceHash(req);
  if (!dh)
    throw new AppError(400, 'DEVICE_ID_REQUIRED', `Missing or invalid ${DEVICE_ID_HEADER} header.`);
  return dh;
}

export function registerAuthDecorators(app: FastifyInstance, { config, pool }: AppDeps) {
  /**
   * Verifies the bearer access token AND that its session is still live, so logout /
   * logout-all / account deletion take effect immediately rather than at token expiry.
   */
  app.decorate('requireAuth', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const claims = verifyAccessToken(config.JWT_ACCESS_SECRET, header.slice(7));
    if (!claims) throw unauthorized('Session expired. Please sign in again.');
    const { rowCount } = await pool.query(
      `SELECT 1 FROM sessions
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
      [claims.sid, claims.sub],
    );
    if (!rowCount) throw unauthorized('Session expired. Please sign in again.');
    req.auth = { userId: claims.sub, sessionId: claims.sid };
  });
}
