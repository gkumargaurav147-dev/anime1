import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  BlocksResponse,
  FriendQrResponse,
  FriendRequestsResponse,
  FriendsResponse,
  SendFriendRequestResponse,
  UserSummary,
} from '@anime/shared-types';
import type { Ctx } from '../app';
import { AppError } from '../errors';
import { authRateLimit } from '../lib/rate-limit';
import { signFriendQrToken, verifyFriendQrToken } from '../lib/tokens';
import { usernameSchema } from './auth';
import {
  ensureDirectConversation,
  findUserById,
  findUserByUsername,
  getFriendship,
  isBlockedEitherWay,
  orderPair,
} from '../services/social';

const uuid = z.uuid();
const userIdParams = z.object({ userId: uuid });

// One message for "doesn't exist", "is you" and "blocked", so blocks can't be detected.
const notFound = () => new AppError(404, 'NOT_FOUND', 'User not found.');

export const friendRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  const { config, pool, bus } = ctx;
  const auth = { preHandler: app.requireAuth };
  const limited = { ...auth, config: authRateLimit(config) };

  const notifyFriendsChanged = (...userIds: string[]) =>
    bus.publish(userIds, { type: 'friends.changed' });

  /** Exact-match lookup only (case-insensitive). There is no search, for anyone. */
  app.get('/users/by-username/:username', limited, async (req) => {
    const { username } = z.object({ username: usernameSchema }).parse(req.params);
    const me = req.auth!.userId;
    const user = await findUserByUsername(pool, username);
    if (!user || user.id === me || (await isBlockedEitherWay(pool, me, user.id))) throw notFound();
    const res: UserSummary = { id: user.id, username: user.username };
    return res;
  });

  app.get('/friends', auth, async (req) => {
    const me = req.auth!.userId;
    const { rows } = await pool.query<{
      id: string;
      username: string;
      accepted_at: Date;
      conversation_id: string | null;
    }>(
      `SELECT u.id, u.username, f.accepted_at, c.id AS conversation_id
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_low = $1 THEN f.user_high ELSE f.user_low END
         LEFT JOIN conversations c ON c.direct_key = f.user_low || ':' || f.user_high
        WHERE (f.user_low = $1 OR f.user_high = $1) AND f.status = 'accepted'
        ORDER BY lower(u.username)`,
      [me],
    );
    const friends = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        username: r.username,
        friendsSince: r.accepted_at.toISOString(),
        conversationId: r.conversation_id ?? (await ensureDirectConversation(pool, me, r.id)),
      })),
    );
    const res: FriendsResponse = { friends };
    return res;
  });

  app.get('/friends/requests', auth, async (req) => {
    const me = req.auth!.userId;
    const { rows } = await pool.query<{
      id: string;
      username: string;
      requested_by: string;
      created_at: Date;
    }>(
      `SELECT u.id, u.username, f.requested_by, f.created_at
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_low = $1 THEN f.user_high ELSE f.user_low END
        WHERE (f.user_low = $1 OR f.user_high = $1) AND f.status = 'pending'
        ORDER BY f.created_at DESC`,
      [me],
    );
    const res: FriendRequestsResponse = {
      requests: rows.map((r) => ({
        user: { id: r.id, username: r.username },
        direction: r.requested_by === me ? 'outgoing' : 'incoming',
        createdAt: r.created_at.toISOString(),
      })),
    };
    return res;
  });

  /** A QR code anyone can scan to send you a request. Short-lived so screenshots go stale. */
  app.get('/friends/qr', auth, async (req) => {
    const res: FriendQrResponse = {
      qrToken: signFriendQrToken(
        config.JWT_ACCESS_SECRET,
        req.auth!.userId,
        config.FRIEND_QR_TTL_SECONDS,
      ),
      expiresInSeconds: config.FRIEND_QR_TTL_SECONDS,
    };
    return res;
  });

  /**
   * Send a request by exact username or QR token. If they already asked you, this accepts.
   * Both sides must act before a friendship exists.
   */
  app.post('/friends/requests', limited, async (req, reply) => {
    const body = z
      .object({ username: usernameSchema.optional(), qrToken: z.string().min(1).optional() })
      .refine((b) => !!b.username !== !!b.qrToken, 'Provide exactly one of username or qrToken')
      .parse(req.body);
    const me = req.auth!.userId;

    let target: UserSummary | null;
    if (body.qrToken) {
      const id = verifyFriendQrToken(config.JWT_ACCESS_SECRET, body.qrToken);
      if (!id) throw new AppError(400, 'QR_INVALID', 'That code has expired. Ask for a new one.');
      target = await findUserById(pool, id);
    } else {
      target = await findUserByUsername(pool, body.username!);
    }
    if (!target || target.id === me || (await isBlockedEitherWay(pool, me, target.id))) {
      throw notFound();
    }
    const user = { id: target.id, username: target.username };

    const existing = await getFriendship(pool, me, target.id);
    if (existing?.status === 'accepted') {
      throw new AppError(409, 'ALREADY_FRIENDS', 'You are already friends.');
    }
    if (existing?.requested_by === me) {
      const res: SendFriendRequestResponse = { status: 'pending', user };
      return reply.status(200).send(res);
    }
    if (existing) {
      await acceptPending(target.id, me);
      const res: SendFriendRequestResponse = { status: 'accepted', user };
      return reply.status(200).send(res);
    }

    const [low, high] = orderPair(me, target.id);
    await pool.query(
      `INSERT INTO friendships (user_low, user_high, status, requested_by)
       VALUES ($1, $2, 'pending', $3) ON CONFLICT DO NOTHING`,
      [low, high, me],
    );
    await notifyFriendsChanged(me, target.id);
    const res: SendFriendRequestResponse = { status: 'pending', user };
    return reply.status(201).send(res);
  });

  async function acceptPending(requesterId: string, accepterId: string) {
    const [low, high] = orderPair(requesterId, accepterId);
    const { rowCount } = await pool.query(
      `UPDATE friendships SET status = 'accepted', accepted_at = now()
        WHERE user_low = $1 AND user_high = $2 AND status = 'pending' AND requested_by = $3`,
      [low, high, requesterId],
    );
    if (!rowCount) throw new AppError(404, 'NOT_FOUND', 'Friend request not found.');
    await ensureDirectConversation(pool, requesterId, accepterId);
    await notifyFriendsChanged(requesterId, accepterId);
  }

  app.post('/friends/requests/:userId/accept', auth, async (req, reply) => {
    const { userId } = userIdParams.parse(req.params);
    const me = req.auth!.userId;
    if (await isBlockedEitherWay(pool, me, userId)) {
      throw new AppError(404, 'NOT_FOUND', 'Friend request not found.');
    }
    await acceptPending(userId, me);
    return reply.status(204).send();
  });

  /** Declines an incoming request or cancels an outgoing one. */
  app.delete('/friends/requests/:userId', auth, async (req, reply) => {
    const { userId } = userIdParams.parse(req.params);
    const me = req.auth!.userId;
    const [low, high] = orderPair(me, userId);
    const { rowCount } = await pool.query(
      `DELETE FROM friendships WHERE user_low = $1 AND user_high = $2 AND status = 'pending'`,
      [low, high],
    );
    if (!rowCount) throw new AppError(404, 'NOT_FOUND', 'Friend request not found.');
    await notifyFriendsChanged(me, userId);
    return reply.status(204).send();
  });

  /** Unfriend. The conversation and its history stay; sending is refused from now on. */
  app.delete('/friends/:userId', auth, async (req, reply) => {
    const { userId } = userIdParams.parse(req.params);
    const me = req.auth!.userId;
    const [low, high] = orderPair(me, userId);
    const { rowCount } = await pool.query(
      `DELETE FROM friendships WHERE user_low = $1 AND user_high = $2 AND status = 'accepted'`,
      [low, high],
    );
    if (!rowCount) throw new AppError(404, 'NOT_FOUND', 'Friend not found.');
    await notifyFriendsChanged(me, userId);
    return reply.status(204).send();
  });

  // ----- Blocks -----

  app.get('/blocks', auth, async (req) => {
    const { rows } = await pool.query<UserSummary>(
      `SELECT u.id, u.username FROM blocks b JOIN users u ON u.id = b.blocked_id
        WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
      [req.auth!.userId],
    );
    const res: BlocksResponse = { blocked: rows };
    return res;
  });

  /** Blocking also ends any friendship or pending request between the two users. */
  app.post('/blocks', limited, async (req, reply) => {
    const { userId } = z.object({ userId: uuid }).parse(req.body);
    const me = req.auth!.userId;
    if (userId === me || !(await findUserById(pool, userId))) throw notFound();
    const [low, high] = orderPair(me, userId);
    await pool.query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [me, userId],
    );
    await pool.query('DELETE FROM friendships WHERE user_low = $1 AND user_high = $2', [low, high]);
    await notifyFriendsChanged(me, userId);
    return reply.status(204).send();
  });

  app.delete('/blocks/:userId', auth, async (req, reply) => {
    const { userId } = userIdParams.parse(req.params);
    await pool.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [
      req.auth!.userId,
      userId,
    ]);
    return reply.status(204).send();
  });
};
