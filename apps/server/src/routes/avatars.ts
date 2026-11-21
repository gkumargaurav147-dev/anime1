import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AvatarConfigSchema, type AvatarConfig } from '@anime/scene-engine';
import type { AvatarResponse, AvatarsResponse } from '@anime/shared-types';
import type { Ctx } from '../app';
import { AppError } from '../errors';
import { authRateLimit } from '../lib/rate-limit';
import { getFriendIds, isBlockedEitherWay } from '../services/social';

const notFound = () => new AppError(404, 'NOT_FOUND', 'Avatar not found.');

/**
 * Avatars are visible to the owner and their friends only. The body is validated against the
 * same schema the renderers use, so the server can never store an avatar the app can't draw.
 */
export const avatarRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  const { config, pool, bus } = ctx;
  const auth = { preHandler: app.requireAuth };

  const load = async (userIds: string[]) => {
    if (!userIds.length) return new Map<string, { config: AvatarConfig; updated_at: Date }>();
    const { rows } = await pool.query<{ user_id: string; config: unknown; updated_at: Date }>(
      'SELECT user_id, config, updated_at FROM avatars WHERE user_id = ANY($1::uuid[])',
      [userIds],
    );
    const out = new Map<string, { config: AvatarConfig; updated_at: Date }>();
    for (const r of rows) {
      // Older/invalid rows are skipped rather than crashing a client renderer.
      const parsed = AvatarConfigSchema.safeParse(r.config);
      if (parsed.success) out.set(r.user_id, { config: parsed.data, updated_at: r.updated_at });
    }
    return out;
  };

  app.get('/me/avatar', auth, async (req) => {
    const me = req.auth!.userId;
    const row = (await load([me])).get(me);
    const res: AvatarResponse = {
      userId: me,
      avatar: row?.config ?? null,
      updatedAt: row?.updated_at.toISOString() ?? null,
    };
    return res;
  });

  app.put('/me/avatar', { ...auth, config: authRateLimit(config) }, async (req) => {
    const { avatar } = z.object({ avatar: AvatarConfigSchema }).parse(req.body);
    const me = req.auth!.userId;
    const { rows } = await pool.query<{ updated_at: Date }>(
      `INSERT INTO avatars (user_id, config, version) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET config = EXCLUDED.config, version = EXCLUDED.version, updated_at = now()
       RETURNING updated_at`,
      [me, JSON.stringify(avatar), avatar.version],
    );
    // Friends' apps refresh their cached copy.
    await bus.publish([me, ...(await getFriendIds(pool, me))], {
      type: 'avatar.changed',
      userId: me,
    });
    const res: AvatarResponse = {
      userId: me,
      avatar,
      updatedAt: rows[0]!.updated_at.toISOString(),
    };
    return res;
  });

  app.get('/users/:id/avatar', auth, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const me = req.auth!.userId;
    if (id !== me) {
      const friends = await getFriendIds(pool, me);
      if (!friends.includes(id) || (await isBlockedEitherWay(pool, me, id))) throw notFound();
    }
    const row = (await load([id])).get(id);
    const res: AvatarResponse = {
      userId: id,
      avatar: row?.config ?? null,
      updatedAt: row?.updated_at.toISOString() ?? null,
    };
    return res;
  });

  /** Batch for chat lists: unknown / non-friend ids are silently left out. */
  app.get('/avatars', auth, async (req) => {
    const { userIds } = z.object({ userIds: z.string().max(8000).default('') }).parse(req.query);
    const me = req.auth!.userId;
    const allowed = new Set([me, ...(await getFriendIds(pool, me))]);
    const ids = userIds
      .split(',')
      .filter((x) => allowed.has(x))
      .slice(0, 200);
    const rows = await load(ids);
    const res: AvatarsResponse = {
      avatars: [...rows.entries()].map(([userId, r]) => ({
        userId,
        avatar: r.config,
        updatedAt: r.updated_at.toISOString(),
      })),
    };
    return res;
  });
};
