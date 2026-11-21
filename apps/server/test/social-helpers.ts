import crypto from 'node:crypto';
import WebSocket from 'ws';
import type { AuthResponse, ClientFrame, FriendsResponse, ServerFrame } from '@anime/shared-types';
import { signupUser, type TestCtx } from './helpers';

export interface TestUser {
  id: string;
  username: string;
  password: string;
  token: string;
  bearer: string;
  auth: AuthResponse;
}

export async function makeUser(ctx: TestCtx, opts: { age?: number; username?: string } = {}) {
  const { auth, username, password } = await signupUser(ctx, opts);
  const u: TestUser = {
    id: auth.user.id,
    username,
    password,
    token: auth.accessToken,
    bearer: `Bearer ${auth.accessToken}`,
    auth,
  };
  return u;
}

/** a asks, b accepts. Returns the direct conversation id. */
export async function makeFriends(ctx: TestCtx, a: TestUser, b: TestUser) {
  await ctx
    .http()
    .post('/friends/requests')
    .set('authorization', a.bearer)
    .send({ username: b.username })
    .expect(201);
  await ctx
    .http()
    .post(`/friends/requests/${a.id}/accept`)
    .set('authorization', b.bearer)
    .expect(204);
  const res = await ctx.http().get('/friends').set('authorization', a.bearer).expect(200);
  return (res.body as FriendsResponse).friends.find((f) => f.id === b.id)!.conversationId;
}

export const newClientId = () => crypto.randomUUID();

export function sendText(
  ctx: TestCtx,
  u: TestUser,
  conversationId: string,
  text: string,
  clientMessageId: string = newClientId(),
) {
  return ctx
    .http()
    .post(`/conversations/${conversationId}/messages`)
    .set('authorization', u.bearer)
    .send({ clientMessageId, text });
}

/** Minimal WebSocket test client that buffers frames and lets tests await specific ones. */
export class TestSocket {
  readonly frames: ServerFrame[] = [];
  closeCode: number | null = null;
  private waiters: { pred: (f: ServerFrame) => boolean; resolve: (f: ServerFrame) => void }[] = [];
  private closeWaiters: ((code: number) => void)[] = [];

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (raw) => {
      const frame = JSON.parse(raw.toString()) as ServerFrame;
      this.frames.push(frame);
      this.waiters = this.waiters.filter((w) => {
        if (!w.pred(frame)) return true;
        w.resolve(frame);
        return false;
      });
    });
    ws.on('close', (code) => {
      this.closeCode = code;
      for (const w of this.closeWaiters) w(code);
    });
  }

  static async open(url: string, opts: { autoPong?: boolean } = {}) {
    const ws = new WebSocket(url, { autoPong: opts.autoPong ?? true });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return new TestSocket(ws);
  }

  /** Opens and authenticates; resolves once the server says `ready`. */
  static async connect(ctx: TestCtx, user: TestUser) {
    const s = await TestSocket.open(ctx.wsUrl);
    s.send({ type: 'auth', token: user.token });
    await s.next((f) => f.type === 'ready');
    return s;
  }

  send(frame: ClientFrame | Record<string, unknown>) {
    this.ws.send(JSON.stringify(frame));
  }

  /** Resolves with the first buffered or future frame matching `pred`. */
  next<T extends ServerFrame['type']>(
    pred: (f: ServerFrame) => boolean,
    timeoutMs = 3000,
  ): Promise<Extract<ServerFrame, { type: T }>> {
    const found = this.frames.find(pred);
    if (found) {
      this.frames.splice(this.frames.indexOf(found), 1);
      return Promise.resolve(found as Extract<ServerFrame, { type: T }>);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for frame')), timeoutMs);
      this.waiters.push({
        pred,
        resolve: (f) => {
          clearTimeout(timer);
          this.frames.splice(this.frames.indexOf(f), 1);
          resolve(f as Extract<ServerFrame, { type: T }>);
        },
      });
    });
  }

  waitForClose(timeoutMs = 3000): Promise<number> {
    if (this.closeCode !== null) return Promise.resolve(this.closeCode);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for close')), timeoutMs);
      this.closeWaiters.push((code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  close() {
    this.ws.close();
  }
}
