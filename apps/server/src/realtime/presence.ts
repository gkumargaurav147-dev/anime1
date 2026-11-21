import type Redis from 'ioredis';
import type { Presence } from '@anime/shared-types';

/**
 * Online = a heartbeat within the last TTL seconds. Keys expire on their own, so a crashed
 * server never leaves users stuck "online".
 */
export interface PresenceStore {
  /** Marks the user online (refreshing the TTL). Returns true if they were offline before. */
  touch(userId: string): Promise<boolean>;
  /** Marks the user offline now and records last seen. */
  setOffline(userId: string): Promise<void>;
  get(userIds: string[]): Promise<Presence[]>;
}

export class MemoryPresenceStore implements PresenceStore {
  private readonly onlineUntil = new Map<string, number>();
  private readonly lastSeen = new Map<string, number>();

  constructor(
    private readonly ttlSeconds: number,
    private readonly now: () => number = Date.now,
  ) {}

  private isOnline(userId: string) {
    return (this.onlineUntil.get(userId) ?? 0) > this.now();
  }

  async touch(userId: string) {
    const wasOnline = this.isOnline(userId);
    this.onlineUntil.set(userId, this.now() + this.ttlSeconds * 1000);
    this.lastSeen.set(userId, this.now());
    return !wasOnline;
  }

  async setOffline(userId: string) {
    this.onlineUntil.delete(userId);
    this.lastSeen.set(userId, this.now());
  }

  async get(userIds: string[]) {
    return userIds.map((userId) => {
      const seen = this.lastSeen.get(userId);
      return {
        userId,
        online: this.isOnline(userId),
        lastSeenAt: seen ? new Date(seen).toISOString() : null,
      };
    });
  }
}

const onlineKey = (id: string) => `presence:online:${id}`;
const seenKey = (id: string) => `presence:seen:${id}`;

export class RedisPresenceStore implements PresenceStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  async touch(userId: string) {
    const now = Date.now().toString();
    // SET ... GET returns the previous value: null means the user was offline.
    const [[, previous]] = (await this.redis
      .multi()
      .set(onlineKey(userId), '1', 'EX', this.ttlSeconds, 'GET')
      .set(seenKey(userId), now)
      .exec()) as [[Error | null, string | null], unknown];
    return previous === null;
  }

  async setOffline(userId: string) {
    await this.redis
      .multi()
      .del(onlineKey(userId))
      .set(seenKey(userId), Date.now().toString())
      .exec();
  }

  async get(userIds: string[]) {
    if (!userIds.length) return [];
    const online = await this.redis.mget(userIds.map(onlineKey));
    const seen = await this.redis.mget(userIds.map(seenKey));
    return userIds.map((userId, i) => ({
      userId,
      online: online[i] !== null,
      lastSeenAt: seen[i] ? new Date(Number(seen[i])).toISOString() : null,
    }));
  }
}
