import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConversationSummary, Message } from '@anime/shared-types';

/** A message written on this device that the server has not confirmed yet. */
export interface OutboxItem {
  clientMessageId: string;
  conversationId: string;
  text: string;
  /** Scene generated on this device (null = text only). */
  animeScene?: Record<string, unknown> | null;
  createdAt: string;
  attempts: number;
  /** Set when the server permanently refused it (e.g. no longer friends). Kept until dismissed. */
  failedReason?: string;
}

/** Messages kept per conversation on the device; older ones are re-fetched on demand. */
export const CACHE_LIMIT = 200;

const key = (userId: string, part: string) => `chat:${userId}:${part}`;

async function readJson<T>(k: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const localStore = {
  loadOutbox: (userId: string) => readJson<OutboxItem[]>(key(userId, 'outbox'), []),
  saveOutbox: (userId: string, items: OutboxItem[]) =>
    AsyncStorage.setItem(key(userId, 'outbox'), JSON.stringify(items)),

  loadConversations: (userId: string) => readJson<ConversationSummary[]>(key(userId, 'convs'), []),
  saveConversations: (userId: string, convs: ConversationSummary[]) =>
    AsyncStorage.setItem(key(userId, 'convs'), JSON.stringify(convs)),

  loadMessages: (userId: string, conversationId: string) =>
    readJson<Message[]>(key(userId, `msgs:${conversationId}`), []),
  saveMessages: (userId: string, conversationId: string, messages: Message[]) =>
    AsyncStorage.setItem(
      key(userId, `msgs:${conversationId}`),
      JSON.stringify(messages.slice(-CACHE_LIMIT)),
    ),

  /** Removes everything this device stored for the user (logout / account deletion). */
  async clear(userId: string) {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(`chat:${userId}:`));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  },
};

/** Merge by id, sorted by seq ascending. Later copies win (they carry newer status). */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  if (!incoming.length) return existing;
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}
