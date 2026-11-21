import type { ClientFrame, ServerFrame } from '@anime/shared-types';

export type ConnectionStatus = 'offline' | 'connecting' | 'online';

interface Options {
  url: string;
  getToken: () => string | null;
  /** Called after a 4401 close; return a fresh token or null to give up (signed out). */
  refreshToken: () => Promise<string | null>;
  onFrame: (frame: ServerFrame) => void;
  onStatus: (status: ConnectionStatus) => void;
}

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const PING_EVERY_MS = 20_000;
const PONG_TIMEOUT_MS = 10_000;

/**
 * One authenticated WebSocket with:
 *  - exponential backoff + jitter on reconnect (1s, 2s, 4s … capped at 30s)
 *  - app-level heartbeat: a ping every 20s; no reply within 10s means the connection is dead
 *  - token refresh on a 4401 close
 * Framework-free so it can be unit tested and reused.
 */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'offline';
  private attempt = 0;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: Options) {}

  get connected() {
    return this.status === 'online';
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'client stop');
    this.setStatus('offline');
  }

  /** Reconnect right away (e.g. app came to the foreground or the network came back). */
  kick() {
    if (this.stopped || this.status !== 'offline') return;
    this.attempt = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connect();
  }

  /** Sends if the socket is ready. Returns false otherwise (callers fall back to HTTP). */
  send(frame: ClientFrame): boolean {
    if (!this.connected || !this.ws) return false;
    this.ws.send(JSON.stringify(frame));
    return true;
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return;
    this.status = s;
    this.opts.onStatus(s);
  }

  private connect() {
    const token = this.opts.getToken();
    if (!token) return this.scheduleReconnect();
    this.setStatus('connecting');

    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token } satisfies ClientFrame));

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(ev.data)) as ServerFrame;
      } catch {
        return;
      }
      // Any traffic proves the connection is alive.
      if (this.pongTimer) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
      if (frame.type === 'ready') {
        this.attempt = 0;
        this.setStatus('online');
        this.startHeartbeat();
      }
      if (frame.type !== 'pong') this.opts.onFrame(frame);
    };

    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      this.setStatus('offline');
      if (this.stopped) return;
      if (ev.code === 4401) {
        // Access token expired or session revoked: refresh, then retry (or stop if signed out).
        void this.opts.refreshToken().then((t) => {
          if (t) this.scheduleReconnect(0);
          else this.stop();
        });
        return;
      }
      this.scheduleReconnect();
    };

    // onerror is always followed by onclose, which handles the retry.
    ws.onerror = () => {};
  }

  private scheduleReconnect(delayMs?: number) {
    if (this.stopped) return;
    const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** this.attempt);
    const delay = delayMs ?? exp / 2 + Math.random() * (exp / 2); // "equal jitter"
    this.attempt += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (!this.ws) return;
      this.ws.send(JSON.stringify({ type: 'ping' } satisfies ClientFrame));
      if (this.pongTimer) return;
      this.pongTimer = setTimeout(() => {
        // Half-open connection: force a close so onclose schedules a reconnect.
        this.ws?.close(4000, 'heartbeat timeout');
      }, PONG_TIMEOUT_MS);
    }, PING_EVERY_MS);
  }

  private clearTimers() {
    for (const t of [this.reconnectTimer, this.pongTimer]) if (t) clearTimeout(t);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = this.pongTimer = this.pingTimer = null;
  }
}
