import { EventEmitter } from 'node:events';
import type Redis from 'ioredis';
import type { ServerFrame } from '@anime/shared-types';

export type BusHandler = (userIds: string[], frame: ServerFrame) => void;

/**
 * Fans events out to every server instance; each instance then delivers to the sockets it
 * holds for those users. In-process when there is no Redis, Redis pub/sub otherwise.
 */
export interface EventBus {
  publish(userIds: string[], frame: ServerFrame): Promise<void>;
  subscribe(handler: BusHandler): void;
  close(): Promise<void>;
}

export class LocalBus implements EventBus {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  async publish(userIds: string[], frame: ServerFrame) {
    if (userIds.length) this.emitter.emit('event', userIds, frame);
  }

  subscribe(handler: BusHandler) {
    this.emitter.on('event', handler);
  }

  async close() {
    this.emitter.removeAllListeners();
  }
}

const CHANNEL = 'anime:events';

export class RedisBus implements EventBus {
  private readonly sub: Redis;
  private readonly handlers: BusHandler[] = [];

  constructor(private readonly pub: Redis) {
    this.sub = pub.duplicate();
    this.sub.on('message', (_channel: string, raw: string) => {
      try {
        const { u, f } = JSON.parse(raw) as { u: string[]; f: ServerFrame };
        for (const h of this.handlers) h(u, f);
      } catch {
        // ignore malformed payloads
      }
    });
    void this.sub.subscribe(CHANNEL);
  }

  async publish(userIds: string[], frame: ServerFrame) {
    if (userIds.length) await this.pub.publish(CHANNEL, JSON.stringify({ u: userIds, f: frame }));
  }

  subscribe(handler: BusHandler) {
    this.handlers.push(handler);
  }

  async close() {
    this.handlers.length = 0;
    await this.sub.quit().catch(() => {});
  }
}
