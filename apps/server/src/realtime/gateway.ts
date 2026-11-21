import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { ClientFrame, ServerFrame } from '@anime/shared-types';
import type { Ctx } from '../app';
import { AppError } from '../errors';
import { authenticateToken, isSessionLive } from '../plugins/auth';
import { markReceipt, sendMessage } from '../services/messages';
import { getFriendIds } from '../services/social';

const frameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(1).max(4096) }),
  z.object({ type: z.literal('ping') }),
  z.object({
    type: z.literal('send'),
    conversationId: z.uuid(),
    clientMessageId: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.enum(['delivered', 'seen']),
    conversationId: z.uuid(),
    upToSeq: z.number().int().min(0),
  }),
]);

interface Conn {
  socket: WebSocket;
  userId: string;
  sessionId: string;
  alive: boolean;
  /** Token bucket for inbound frames. */
  tokens: number;
  refilledAt: number;
}

const BUCKET_SIZE = 30;
const REFILL_PER_SEC = 3;

/**
 * GET /ws — authenticated realtime channel.
 *  - first frame must be {type:'auth', token} within WS_AUTH_TIMEOUT_MS
 *  - server pings every HEARTBEAT_INTERVAL_MS; a socket that misses a round is terminated,
 *    and every round re-checks the session (logout/deletion closes sockets) and refreshes
 *    presence
 *  - events for a user arrive via the EventBus, so any instance can deliver them
 */
export async function registerGateway(app: FastifyInstance, ctx: Ctx) {
  const { config, pool, bus, presence } = ctx;
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  const byUser = new Map<string, Set<Conn>>();

  const send = (conn: Conn, frame: ServerFrame) => {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(frame));
  };

  bus.subscribe((userIds, frame) => {
    for (const id of userIds) for (const conn of byUser.get(id) ?? []) send(conn, frame);
  });

  const announcePresence = async (userId: string, online: boolean) => {
    const [p] = await presence.get([userId]);
    const friends = await getFriendIds(pool, userId);
    await bus.publish(friends, {
      type: 'presence',
      userId,
      online,
      lastSeenAt: p?.lastSeenAt ?? null,
    });
  };

  const heartbeat = setInterval(() => {
    for (const conns of byUser.values()) {
      for (const conn of conns) {
        if (!conn.alive) {
          conn.socket.terminate();
          continue;
        }
        conn.alive = false;
        conn.socket.ping();
        void (async () => {
          if (!(await isSessionLive(pool, conn.userId, conn.sessionId))) {
            conn.socket.close(4401, 'session ended');
            return;
          }
          if (await presence.touch(conn.userId)) await announcePresence(conn.userId, true);
        })().catch((err) => app.log.warn({ err }, 'heartbeat check failed'));
      }
    }
  }, config.HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
    for (const conns of byUser.values()) for (const c of conns) c.socket.terminate();
    byUser.clear();
  });

  app.get('/ws', { websocket: true }, (socket) => {
    let conn: Conn | null = null;
    // Frames from one socket are handled strictly in order (keeps a device's messages ordered).
    let chain: Promise<unknown> = Promise.resolve();
    const authTimer = setTimeout(() => {
      if (!conn) socket.close(4408, 'auth timeout');
    }, config.WS_AUTH_TIMEOUT_MS);

    const fail = (code: string, message: string, clientMessageId?: string) =>
      socket.send(
        JSON.stringify({ type: 'error', code, message, clientMessageId } satisfies ServerFrame),
      );

    socket.on('pong', () => {
      if (conn) conn.alive = true;
    });

    socket.on('message', (raw) => {
      chain = chain.then(() => handle(raw)).catch((err) => app.log.error({ err }, 'ws handler'));
    });

    const handle = async (raw: unknown) => {
      let frame: ClientFrame;
      try {
        frame = frameSchema.parse(JSON.parse(String(raw))) as ClientFrame;
      } catch {
        return fail('VALIDATION_ERROR', 'Malformed frame.');
      }

      if (!conn) {
        if (frame.type !== 'auth') return socket.close(4401, 'auth required');
        const auth = await authenticateToken(ctx, frame.token).catch(() => null);
        if (!auth) return socket.close(4401, 'auth failed');
        clearTimeout(authTimer);
        conn = {
          socket,
          ...auth,
          alive: true,
          tokens: BUCKET_SIZE,
          refilledAt: Date.now(),
        };
        let set = byUser.get(auth.userId);
        if (!set) byUser.set(auth.userId, (set = new Set()));
        set.add(conn);
        send(conn, {
          type: 'ready',
          userId: auth.userId,
          heartbeatIntervalMs: config.HEARTBEAT_INTERVAL_MS,
        });
        if (await presence.touch(auth.userId)) await announcePresence(auth.userId, true);
        return;
      }

      conn.alive = true;
      const now = Date.now();
      conn.tokens = Math.min(
        BUCKET_SIZE,
        conn.tokens + ((now - conn.refilledAt) / 1000) * REFILL_PER_SEC,
      );
      conn.refilledAt = now;
      if (conn.tokens < 1) {
        return fail(
          'RATE_LIMITED',
          'Slow down.',
          frame.type === 'send' ? frame.clientMessageId : undefined,
        );
      }
      conn.tokens -= 1;

      try {
        switch (frame.type) {
          case 'auth':
            return;
          case 'ping':
            return send(conn, { type: 'pong' });
          case 'send': {
            const r = await sendMessage(
              ctx,
              conn.userId,
              frame.conversationId,
              frame.clientMessageId,
              frame.text,
            );
            return send(conn, { type: 'ack', clientMessageId: frame.clientMessageId, ...r });
          }
          case 'delivered':
          case 'seen':
            await markReceipt(ctx, conn.userId, frame.conversationId, frame.type, frame.upToSeq);
            return;
        }
      } catch (err) {
        const clientMessageId = frame.type === 'send' ? frame.clientMessageId : undefined;
        if (err instanceof AppError) return fail(err.code, err.message, clientMessageId);
        app.log.error({ err }, 'ws frame failed');
        return fail('INTERNAL_ERROR', 'Something went wrong.', clientMessageId);
      }
    };

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (!conn) return;
      const set = byUser.get(conn.userId);
      set?.delete(conn);
      if (set && set.size === 0) {
        byUser.delete(conn.userId);
        const userId = conn.userId;
        void presence
          .setOffline(userId)
          .then(() => announcePresence(userId, false))
          .catch((err) => app.log.warn({ err }, 'presence offline failed'));
      }
    });
  });
}
