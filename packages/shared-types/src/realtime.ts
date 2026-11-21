import type { Message, MessageStatus, Presence, SendMessageBody } from './social';

/**
 * WebSocket protocol on GET /ws (JSON text frames).
 * The first client frame must be `auth` within 5 seconds, otherwise the socket closes with 4401.
 */
export type ClientFrame =
  | { type: 'auth'; token: string }
  | { type: 'ping' }
  | ({ type: 'send'; conversationId: string } & SendMessageBody)
  | { type: 'delivered'; conversationId: string; upToSeq: number }
  | { type: 'seen'; conversationId: string; upToSeq: number };

export type ServerFrame =
  | { type: 'ready'; userId: string; heartbeatIntervalMs: number }
  | { type: 'pong' }
  /** A new message in one of your conversations (also echoed to your other devices). */
  | { type: 'message'; message: Message }
  /** Reply to a `send` frame. */
  | { type: 'ack'; clientMessageId: string; message: Message; duplicate: boolean }
  /** `userId` has received/seen every message up to `upToSeq` in the conversation. */
  | {
      type: 'receipt';
      conversationId: string;
      userId: string;
      status: Exclude<MessageStatus, 'sent'>;
      upToSeq: number;
    }
  | ({ type: 'presence' } & Presence)
  /** Friends or requests changed; refetch the lists. */
  | { type: 'friends.changed' }
  | { type: 'error'; code: string; message: string; clientMessageId?: string };

/**
 * WebSocket close codes used by the server:
 * 4401 auth failed (refresh the access token, then reconnect), 4408 no auth frame in time,
 * 4000 heartbeat timeout.
 */
export type WsCloseCode = 4401 | 4408 | 4000;
