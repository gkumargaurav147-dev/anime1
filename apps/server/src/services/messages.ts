import type { Pool } from 'pg';
import type { Message, MessageStatus } from '@anime/shared-types';
import { AppError } from '../errors';
import type { EventBus } from '../realtime/bus';
import { canMessage } from './social';

export interface MessageRow {
  id: string;
  conversation_id: string;
  seq: string; // bigint comes back as string
  sender_id: string;
  client_message_id: string;
  text: string;
  anime_scene: Record<string, unknown> | null;
  status: MessageStatus;
  created_at: Date;
}

export const MESSAGE_COLUMNS =
  'id, conversation_id, seq, sender_id, client_message_id, text, anime_scene, status, created_at';

export const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  seq: Number(r.seq),
  senderId: r.sender_id,
  clientMessageId: r.client_message_id,
  text: r.text,
  animeScene: r.anime_scene,
  status: r.status,
  createdAt: r.created_at.toISOString(),
});

export const CLIENT_MESSAGE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const MAX_TEXT_LENGTH = 4000;

/** Members of a conversation, or 404 if `userId` is not one of them. */
export async function requireMembership(pool: Pool, conversationId: string, userId: string) {
  const { rows } = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM conversation_members WHERE conversation_id = $1',
    [conversationId],
  );
  const members = rows.map((r) => r.user_id);
  if (!members.includes(userId)) {
    throw new AppError(404, 'NOT_FOUND', 'Conversation not found.');
  }
  return members;
}

interface Deps {
  pool: Pool;
  bus: EventBus;
}

/**
 * Stores a text message exactly once per (sender, clientMessageId) and fans it out.
 * Retrying with the same clientMessageId returns the stored message with `duplicate: true`.
 */
export async function sendMessage(
  { pool, bus }: Deps,
  senderId: string,
  conversationId: string,
  clientMessageId: string,
  text: string,
): Promise<{ message: Message; duplicate: boolean }> {
  if (!CLIENT_MESSAGE_ID_RE.test(clientMessageId)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'clientMessageId must be 8-64 URL-safe characters.',
    );
  }
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) {
    throw new AppError(400, 'VALIDATION_ERROR', `Message must be 1-${MAX_TEXT_LENGTH} characters.`);
  }

  const members = await requireMembership(pool, conversationId, senderId);

  const existing = await findByClientId(pool, senderId, clientMessageId);
  if (existing) return duplicateOf(existing, conversationId);

  const others = members.filter((m) => m !== senderId);
  for (const other of others) {
    if (!(await canMessage(pool, senderId, other))) {
      throw new AppError(403, 'NOT_FRIENDS', 'You can only message your friends.');
    }
  }

  const client = await pool.connect();
  let row: MessageRow | undefined;
  try {
    await client.query('BEGIN');
    // Row lock on the conversation serialises seq allocation.
    const seqRes = await client.query<{ last_seq: string }>(
      `UPDATE conversations SET last_seq = last_seq + 1, last_message_at = now()
        WHERE id = $1 RETURNING last_seq`,
      [conversationId],
    );
    const inserted = await client.query<MessageRow>(
      `INSERT INTO messages (conversation_id, seq, sender_id, client_message_id, text)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (sender_id, client_message_id) DO NOTHING
       RETURNING ${MESSAGE_COLUMNS}`,
      [conversationId, seqRes.rows[0]!.last_seq, senderId, clientMessageId, text],
    );
    row = inserted.rows[0];
    // A concurrent retry won the race: undo our seq bump and return theirs.
    await client.query(row ? 'COMMIT' : 'ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (!row) {
    const winner = await findByClientId(pool, senderId, clientMessageId);
    if (!winner) throw new AppError(409, 'CONFLICT', 'Please retry.');
    return duplicateOf(winner, conversationId);
  }

  const message = toMessage(row);
  // Everyone in the conversation, including the sender's other devices.
  await bus.publish(members, { type: 'message', message });
  return { message, duplicate: false };
}

async function findByClientId(pool: Pool, senderId: string, clientMessageId: string) {
  const { rows } = await pool.query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE sender_id = $1 AND client_message_id = $2`,
    [senderId, clientMessageId],
  );
  return rows[0];
}

function duplicateOf(row: MessageRow, conversationId: string) {
  if (row.conversation_id !== conversationId) {
    throw new AppError(
      409,
      'CONFLICT',
      'clientMessageId was already used in another conversation.',
    );
  }
  return { message: toMessage(row), duplicate: true };
}

/**
 * Moves the user's delivered/seen pointer forward (never back) and upgrades the status of
 * the other members' messages up to that point. Seen implies delivered.
 */
export async function markReceipt(
  { pool, bus }: Deps,
  userId: string,
  conversationId: string,
  kind: 'delivered' | 'seen',
  upToSeq: number,
) {
  if (!Number.isInteger(upToSeq) || upToSeq < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'upToSeq must be a non-negative integer.');
  }
  const members = await requireMembership(pool, conversationId, userId);

  const { rows } = await pool.query<{ advanced: boolean; up_to: string }>(
    `WITH conv AS (SELECT last_seq FROM conversations WHERE id = $1),
          target AS (SELECT LEAST($3::bigint, (SELECT last_seq FROM conv)) AS v),
          before AS (
            SELECT delivered_up_to, seen_up_to FROM conversation_members
             WHERE conversation_id = $1 AND user_id = $2
          ),
          upd AS (
            UPDATE conversation_members m
               SET delivered_up_to = GREATEST(m.delivered_up_to, (SELECT v FROM target)),
                   seen_up_to = CASE WHEN $4 = 'seen'
                                     THEN GREATEST(m.seen_up_to, (SELECT v FROM target))
                                     ELSE m.seen_up_to END
             WHERE conversation_id = $1 AND user_id = $2
            RETURNING delivered_up_to, seen_up_to
          )
     SELECT (CASE WHEN $4 = 'seen' THEN upd.seen_up_to > before.seen_up_to
                  ELSE upd.delivered_up_to > before.delivered_up_to END) AS advanced,
            (CASE WHEN $4 = 'seen' THEN upd.seen_up_to ELSE upd.delivered_up_to END) AS up_to
       FROM upd, before`,
    [conversationId, userId, upToSeq, kind],
  );
  const result = rows[0];
  if (!result?.advanced) return { advanced: false, upToSeq: Number(result?.up_to ?? 0) };
  const upTo = Number(result.up_to);

  if (kind === 'seen') {
    await pool.query(
      `UPDATE messages SET status = 'seen'
        WHERE conversation_id = $1 AND sender_id <> $2 AND seq <= $3 AND status <> 'seen'`,
      [conversationId, userId, upTo],
    );
  } else {
    await pool.query(
      `UPDATE messages SET status = 'delivered'
        WHERE conversation_id = $1 AND sender_id <> $2 AND seq <= $3 AND status = 'sent'`,
      [conversationId, userId, upTo],
    );
  }

  await bus.publish(members, {
    type: 'receipt',
    conversationId,
    userId,
    status: kind,
    upToSeq: upTo,
  });
  return { advanced: true, upToSeq: upTo };
}
