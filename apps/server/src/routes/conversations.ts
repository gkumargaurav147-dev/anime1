import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ConversationSummary,
  ConversationsResponse,
  MessagesPage,
  PresenceResponse,
  SendMessageResponse,
} from '@anime/shared-types';
import type { Ctx } from '../app';
import { AppError } from '../errors';
import {
  MESSAGE_COLUMNS,
  markReceipt,
  requireMembership,
  sendMessage,
  toMessage,
  type MessageRow,
} from '../services/messages';
import { canMessage, getFriendIds } from '../services/social';

const idParams = z.object({ id: z.uuid() });
const MAX_PAGE = 100;

export const conversationRoutes = (ctx: Ctx) => async (app: FastifyInstance) => {
  const { config, pool, presence } = ctx;
  const auth = { preHandler: app.requireAuth };

  app.get('/conversations', auth, async (req) => {
    const me = req.auth!.userId;
    const { rows } = await pool.query<{
      id: string;
      last_seq: string;
      delivered_up_to: string;
      seen_up_to: string;
      peer_id: string;
      peer_username: string;
      peer_delivered_up_to: string;
      peer_seen_up_to: string;
      unread: string;
    }>(
      `SELECT c.id, c.last_seq, me.delivered_up_to, me.seen_up_to,
              u.id AS peer_id, u.username AS peer_username,
              p.delivered_up_to AS peer_delivered_up_to, p.seen_up_to AS peer_seen_up_to,
              (SELECT count(*) FROM messages m
                WHERE m.conversation_id = c.id AND m.seq > me.seen_up_to AND m.sender_id <> $1
              ) AS unread
         FROM conversation_members me
         JOIN conversations c ON c.id = me.conversation_id
         JOIN conversation_members p ON p.conversation_id = c.id AND p.user_id <> $1
         JOIN users u ON u.id = p.user_id
        WHERE me.user_id = $1
        ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [me],
    );

    const lastMessages = new Map<string, MessageRow>();
    if (rows.length) {
      const last = await pool.query<MessageRow>(
        `SELECT ${MESSAGE_COLUMNS} FROM messages m
          WHERE (m.conversation_id, m.seq) IN (
            SELECT id, last_seq FROM conversations WHERE id = ANY($1::uuid[]))`,
        [rows.map((r) => r.id)],
      );
      for (const m of last.rows) lastMessages.set(m.conversation_id, m);
    }

    const conversations: ConversationSummary[] = await Promise.all(
      rows.map(async (r) => {
        const lastMessage = lastMessages.get(r.id);
        return {
          id: r.id,
          kind: 'direct' as const,
          peer: { id: r.peer_id, username: r.peer_username },
          canSend: await canMessage(pool, me, r.peer_id),
          lastSeq: Number(r.last_seq),
          lastMessage: lastMessage ? toMessage(lastMessage) : null,
          deliveredUpTo: Number(r.delivered_up_to),
          seenUpTo: Number(r.seen_up_to),
          peerDeliveredUpTo: Number(r.peer_delivered_up_to),
          peerSeenUpTo: Number(r.peer_seen_up_to),
          unreadCount: Number(r.unread),
        };
      }),
    );
    const res: ConversationsResponse = { conversations };
    return res;
  });

  /**
   * Cursor pagination on `seq`.
   *   ?before=<seq>  older messages, newest first (pass nothing for the latest page)
   *   ?after=<seq>   newer messages, oldest first (catch-up sync after reconnect)
   */
  app.get('/conversations/:id/messages', auth, async (req) => {
    const { id } = idParams.parse(req.params);
    const q = z
      .object({
        before: z.coerce.number().int().min(0).optional(),
        after: z.coerce.number().int().min(0).optional(),
        limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(50),
      })
      .refine(
        (v) => v.before === undefined || v.after === undefined,
        'Use before or after, not both',
      )
      .parse(req.query);
    await requireMembership(pool, id, req.auth!.userId);

    const forward = q.after !== undefined;
    const { rows } = await pool.query<MessageRow>(
      forward
        ? `SELECT ${MESSAGE_COLUMNS} FROM messages
            WHERE conversation_id = $1 AND seq > $2 ORDER BY seq ASC LIMIT $3`
        : `SELECT ${MESSAGE_COLUMNS} FROM messages
            WHERE conversation_id = $1 AND seq < $2 ORDER BY seq DESC LIMIT $3`,
      [id, forward ? q.after : (q.before ?? Number.MAX_SAFE_INTEGER), q.limit + 1],
    );
    const hasMore = rows.length > q.limit;
    const messages = rows.slice(0, q.limit).map(toMessage);
    const res: MessagesPage = {
      messages,
      nextCursor: hasMore ? messages[messages.length - 1]!.seq : null,
    };
    return res;
  });

  app.post(
    '/conversations/:id/messages',
    {
      ...auth,
      config: { rateLimit: { max: config.MESSAGE_RATE_LIMIT_MAX, timeWindow: 60_000 } },
    },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const body = z.object({ clientMessageId: z.string(), text: z.string() }).parse(req.body);
      const result = await sendMessage(ctx, req.auth!.userId, id, body.clientMessageId, body.text);
      const res: SendMessageResponse = result;
      return reply.status(result.duplicate ? 200 : 201).send(res);
    },
  );

  for (const kind of ['delivered', 'seen'] as const) {
    app.post(`/conversations/:id/${kind}`, auth, async (req) => {
      const { id } = idParams.parse(req.params);
      const { upToSeq } = z.object({ upToSeq: z.number().int().min(0) }).parse(req.body);
      return markReceipt(ctx, req.auth!.userId, id, kind, upToSeq);
    });
  }

  /** Presence of your friends only; anyone else is silently left out. */
  app.get('/presence', auth, async (req) => {
    const { userIds } = z.object({ userIds: z.string().max(4000).default('') }).parse(req.query);
    const requested = userIds.split(',').filter(Boolean);
    if (requested.length > 200) throw new AppError(400, 'VALIDATION_ERROR', 'Too many userIds.');
    const friends = new Set(await getFriendIds(pool, req.auth!.userId));
    const res: PresenceResponse = {
      presence: await presence.get(requested.filter((id) => friends.has(id))),
    };
    return res;
  });
};
