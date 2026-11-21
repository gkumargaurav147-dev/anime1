import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { uuid } from '../lib/uuid';
import type {
  ConversationSummary,
  ConversationsResponse,
  Message,
  MessagesPage,
  Presence,
  PresenceResponse,
  SendMessageResponse,
  ServerFrame,
} from '@anime/shared-types';
import { useAuth } from '../auth/AuthContext';
import { API_URL, ApiRequestError } from '../lib/api';
import { RealtimeClient, type ConnectionStatus } from '../realtime/RealtimeClient';
import { localStore, mergeMessages, type OutboxItem } from './localStore';

const WS_URL = `${API_URL.replace(/^http/, 'ws')}/ws`;
const PAGE = 50;
/** Errors that will never succeed on retry: the message is parked as failed. */
const PERMANENT = new Set([400, 403, 404, 409]);

interface ChatContextValue {
  myUserId: string | null;
  status: ConnectionStatus;
  conversations: ConversationSummary[];
  messages: Record<string, Message[]>;
  outbox: OutboxItem[];
  presence: Record<string, Presence>;
  hasOlder: Record<string, boolean>;
  /** Bumped whenever the server says friends/requests changed. */
  friendsVersion: number;
  openConversation: (id: string) => Promise<void>;
  loadOlder: (id: string) => Promise<void>;
  sendText: (conversationId: string, text: string) => Promise<void>;
  retry: (clientMessageId: string) => void;
  discard: (clientMessageId: string) => void;
  setActiveConversation: (id: string | null) => void;
  refreshConversations: () => Promise<void>;
  /** Tries to send anything queued, then wipes this user's local chat data. */
  resetLocalData: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { session, authedRequest, getAccessToken, refreshAccessToken } = useAuth();
  const userId = session?.user.id ?? null;

  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [conversations, setConversationsState] = useState<ConversationSummary[]>([]);
  const [messages, setMessagesState] = useState<Record<string, Message[]>>({});
  const [outbox, setOutboxState] = useState<OutboxItem[]>([]);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [hasOlder, setHasOlder] = useState<Record<string, boolean>>({});
  const [friendsVersion, setFriendsVersion] = useState(0);

  // Refs mirror state so async flows (socket handlers, flush loops) never read stale values.
  const userRef = useRef<string | null>(null);
  const convsRef = useRef<ConversationSummary[]>([]);
  const msgsRef = useRef<Record<string, Message[]>>({});
  const loadedRef = useRef(new Set<string>());
  const outboxRef = useRef<OutboxItem[]>([]);
  const activeRef = useRef<string | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);
  const flushingRef = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempt = useRef(0);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // ---------- state setters that also persist ----------

  const setConversations = useCallback((next: ConversationSummary[]) => {
    convsRef.current = next;
    setConversationsState(next);
    if (userRef.current) void localStore.saveConversations(userRef.current, next);
  }, []);

  const updateConversation = useCallback(
    (id: string, fn: (c: ConversationSummary) => ConversationSummary) => {
      setConversations(convsRef.current.map((c) => (c.id === id ? fn(c) : c)));
    },
    [setConversations],
  );

  const setOutbox = useCallback(async (next: OutboxItem[]) => {
    outboxRef.current = next;
    setOutboxState(next);
    if (userRef.current) await localStore.saveOutbox(userRef.current, next);
  }, []);

  const mergeInto = useCallback((conversationId: string, incoming: Message[]) => {
    const merged = mergeMessages(msgsRef.current[conversationId] ?? [], incoming);
    msgsRef.current = { ...msgsRef.current, [conversationId]: merged };
    setMessagesState(msgsRef.current);
    const uid = userRef.current;
    if (!uid) return;
    // Debounced write of the conversation cache.
    clearTimeout(saveTimers.current.get(conversationId));
    saveTimers.current.set(
      conversationId,
      setTimeout(() => void localStore.saveMessages(uid, conversationId, merged), 300),
    );
  }, []);

  const ensureLoaded = useCallback(
    async (conversationId: string) => {
      const uid = userRef.current;
      if (!uid || loadedRef.current.has(conversationId)) return;
      loadedRef.current.add(conversationId);
      mergeInto(conversationId, await localStore.loadMessages(uid, conversationId));
    },
    [mergeInto],
  );

  const maxSeq = (conversationId: string) =>
    (msgsRef.current[conversationId] ?? []).reduce((m, x) => Math.max(m, x.seq), 0);

  // ---------- receipts ----------

  const sendReceipt = useCallback(
    (conversationId: string, kind: 'delivered' | 'seen', upToSeq: number) => {
      const sent = clientRef.current?.send({ type: kind, conversationId, upToSeq });
      if (!sent) {
        void authedRequest(`/conversations/${conversationId}/${kind}`, {
          method: 'POST',
          body: { upToSeq },
        }).catch(() => {});
      }
    },
    [authedRequest],
  );

  const markSeen = useCallback(
    (conversationId: string) => {
      const conv = convsRef.current.find((c) => c.id === conversationId);
      if (!conv || conv.lastSeq <= conv.seenUpTo || AppState.currentState !== 'active') return;
      sendReceipt(conversationId, 'seen', conv.lastSeq);
      updateConversation(conversationId, (c) => ({
        ...c,
        seenUpTo: c.lastSeq,
        deliveredUpTo: Math.max(c.deliveredUpTo, c.lastSeq),
        unreadCount: 0,
      }));
    },
    [sendReceipt, updateConversation],
  );

  // ---------- outbox: persisted first, sent in order, retried until confirmed ----------

  const onConfirmed = useCallback(
    (message: Message) => {
      mergeInto(message.conversationId, [message]);
      const rest = outboxRef.current.filter((o) => o.clientMessageId !== message.clientMessageId);
      if (rest.length !== outboxRef.current.length) void setOutbox(rest);
      updateConversation(message.conversationId, (c) =>
        message.seq >= c.lastSeq ? { ...c, lastSeq: message.seq, lastMessage: message } : c,
      );
    },
    [mergeInto, setOutbox, updateConversation],
  );

  const flushOutbox = useCallback(async () => {
    if (flushingRef.current || !userRef.current) return;
    flushingRef.current = true;
    try {
      // Read the live queue each round so messages added mid-flush go out in the same pass.
      for (;;) {
        const item = outboxRef.current.find((o) => !o.failedReason);
        if (!item) break;
        try {
          const res = await authedRequest<SendMessageResponse>(
            `/conversations/${item.conversationId}/messages`,
            { method: 'POST', body: { clientMessageId: item.clientMessageId, text: item.text } },
          );
          onConfirmed(res.message);
          retryAttempt.current = 0;
        } catch (e) {
          const status = e instanceof ApiRequestError ? e.status : 0;
          if (PERMANENT.has(status)) {
            await setOutbox(
              outboxRef.current.map((o) =>
                o.clientMessageId === item.clientMessageId
                  ? { ...o, failedReason: (e as Error).message, attempts: o.attempts + 1 }
                  : o,
              ),
            );
            continue;
          }
          if (status === 401) return; // signed out; the queue resumes after the next sign-in
          // Offline, 5xx or rate limited: keep everything queued (in order) and retry later.
          await setOutbox(
            outboxRef.current.map((o) =>
              o.clientMessageId === item.clientMessageId ? { ...o, attempts: o.attempts + 1 } : o,
            ),
          );
          const delay = Math.min(60_000, 2_000 * 2 ** retryAttempt.current++);
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => void flushOutbox(), delay);
          return;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [authedRequest, onConfirmed, setOutbox]);

  // ---------- sync ----------

  const fetchPresence = useCallback(
    async (convs: ConversationSummary[]) => {
      const ids = [...new Set(convs.map((c) => c.peer.id))];
      if (!ids.length) return;
      const res = await authedRequest<PresenceResponse>(`/presence?userIds=${ids.join(',')}`);
      setPresence((p) => ({ ...p, ...Object.fromEntries(res.presence.map((x) => [x.userId, x])) }));
    },
    [authedRequest],
  );

  const refreshConversations = useCallback(async () => {
    const res = await authedRequest<ConversationsResponse>('/conversations');
    setConversations(res.conversations);
    void fetchPresence(res.conversations).catch(() => {});
  }, [authedRequest, fetchPresence, setConversations]);

  /** Fetches everything newer than what this device has (after a reconnect / cold start). */
  const catchUp = useCallback(
    async (conv: ConversationSummary) => {
      await ensureLoaded(conv.id);
      let after = maxSeq(conv.id);
      if (conv.lastSeq <= after) return;
      if (after === 0) {
        const page = await authedRequest<MessagesPage>(
          `/conversations/${conv.id}/messages?limit=${PAGE}`,
        );
        mergeInto(conv.id, page.messages);
        setHasOlder((h) => ({ ...h, [conv.id]: page.nextCursor !== null }));
        return;
      }
      for (let i = 0; i < 20 && after < conv.lastSeq; i++) {
        const page = await authedRequest<MessagesPage>(
          `/conversations/${conv.id}/messages?after=${after}&limit=100`,
        );
        mergeInto(conv.id, page.messages);
        if (page.nextCursor === null) break;
        after = page.nextCursor;
      }
    },
    [authedRequest, ensureLoaded, mergeInto],
  );

  const sync = useCallback(async () => {
    try {
      await refreshConversations();
      for (const conv of convsRef.current) {
        await catchUp(conv).catch(() => {});
        const fromPeer = conv.lastMessage && conv.lastMessage.senderId !== userRef.current;
        if (fromPeer && conv.lastSeq > conv.deliveredUpTo) {
          sendReceipt(conv.id, 'delivered', conv.lastSeq);
        }
      }
      if (activeRef.current) markSeen(activeRef.current);
    } finally {
      void flushOutbox();
    }
  }, [catchUp, flushOutbox, markSeen, refreshConversations, sendReceipt]);

  // ---------- socket frames ----------

  const onFrame = useCallback(
    (frame: ServerFrame) => {
      const me = userRef.current;
      switch (frame.type) {
        case 'ready':
          void sync();
          return;
        case 'message':
        case 'ack': {
          const m = frame.message;
          if (m.senderId === me) return onConfirmed(m);
          mergeInto(m.conversationId, [m]);
          const known = convsRef.current.some((c) => c.id === m.conversationId);
          if (!known) return void refreshConversations().catch(() => {});
          const active = activeRef.current === m.conversationId;
          updateConversation(m.conversationId, (c) => ({
            ...c,
            lastSeq: Math.max(c.lastSeq, m.seq),
            lastMessage: m.seq >= c.lastSeq ? m : c.lastMessage,
            unreadCount: active ? c.unreadCount : c.unreadCount + 1,
          }));
          sendReceipt(m.conversationId, 'delivered', m.seq);
          if (active) markSeen(m.conversationId);
          return;
        }
        case 'receipt': {
          updateConversation(frame.conversationId, (c) => {
            if (frame.userId === me) {
              // Read on another of my devices.
              const seenUpTo =
                frame.status === 'seen' ? Math.max(c.seenUpTo, frame.upToSeq) : c.seenUpTo;
              return {
                ...c,
                seenUpTo,
                deliveredUpTo: Math.max(c.deliveredUpTo, frame.upToSeq),
                unreadCount: seenUpTo >= c.lastSeq ? 0 : c.unreadCount,
              };
            }
            return {
              ...c,
              peerDeliveredUpTo: Math.max(c.peerDeliveredUpTo, frame.upToSeq),
              peerSeenUpTo:
                frame.status === 'seen' ? Math.max(c.peerSeenUpTo, frame.upToSeq) : c.peerSeenUpTo,
            };
          });
          return;
        }
        case 'presence': {
          const p: Presence = {
            userId: frame.userId,
            online: frame.online,
            lastSeenAt: frame.lastSeenAt,
          };
          setPresence((prev) => ({ ...prev, [p.userId]: p }));
          return;
        }
        case 'friends.changed':
          setFriendsVersion((v) => v + 1);
          void refreshConversations().catch(() => {});
          return;
        case 'error':
          return;
      }
    },
    [markSeen, mergeInto, onConfirmed, refreshConversations, sendReceipt, sync, updateConversation],
  );

  // Keep the socket's callbacks pointed at the latest closures.
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  // ---------- lifecycle ----------

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    userRef.current = userId;
    loadedRef.current = new Set();
    msgsRef.current = {};
    setMessagesState({});

    void (async () => {
      const [convs, queued] = await Promise.all([
        localStore.loadConversations(userId),
        localStore.loadOutbox(userId),
      ]);
      if (cancelled) return;
      convsRef.current = convs;
      setConversationsState(convs);
      outboxRef.current = queued;
      setOutboxState(queued);

      const client = new RealtimeClient({
        url: WS_URL,
        getToken: getAccessToken,
        refreshToken: refreshAccessToken,
        onFrame: (f) => onFrameRef.current(f),
        onStatus: setStatus,
      });
      clientRef.current = client;
      client.start();
      // Queued messages go out over HTTP even before the socket is up.
      void flushOutbox();
    })();

    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      clientRef.current?.kick();
      void flushOutbox();
      if (activeRef.current) markSeen(activeRef.current);
    });

    return () => {
      cancelled = true;
      sub.remove();
      clientRef.current?.stop();
      clientRef.current = null;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      userRef.current = null;
    };
    // Only re-run per signed-in user; the callbacks used inside read refs, so they stay current.
  }, [userId]);

  // ---------- public API ----------

  const value = useMemo<ChatContextValue>(
    () => ({
      myUserId: userId,
      status,
      conversations,
      messages,
      outbox,
      presence,
      hasOlder,
      friendsVersion,
      refreshConversations,

      async openConversation(id) {
        await ensureLoaded(id);
        let conv = convsRef.current.find((c) => c.id === id);
        if (!conv) {
          await refreshConversations().catch(() => {});
          conv = convsRef.current.find((c) => c.id === id);
        }
        if (conv) await catchUp(conv).catch(() => {});
        if (!(id in hasOlder)) {
          const minSeq = (msgsRef.current[id] ?? [])[0]?.seq ?? 0;
          setHasOlder((h) => ({ ...h, [id]: minSeq > 1 }));
        }
      },

      async loadOlder(id) {
        const oldest = (msgsRef.current[id] ?? [])[0]?.seq;
        if (!oldest || oldest <= 1) return setHasOlder((h) => ({ ...h, [id]: false }));
        const page = await authedRequest<MessagesPage>(
          `/conversations/${id}/messages?before=${oldest}&limit=${PAGE}`,
        );
        mergeInto(id, page.messages);
        setHasOlder((h) => ({ ...h, [id]: page.nextCursor !== null }));
      },

      async sendText(conversationId, text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        const item: OutboxItem = {
          clientMessageId: uuid(),
          conversationId,
          text: trimmed,
          createdAt: new Date().toISOString(),
          attempts: 0,
        };
        // Persist before trying to send, so a crash or kill never loses it.
        await setOutbox([...outboxRef.current, item]);
        void flushOutbox();
      },

      retry(clientMessageId) {
        void setOutbox(
          outboxRef.current.map((o) =>
            o.clientMessageId === clientMessageId ? { ...o, failedReason: undefined } : o,
          ),
        ).then(() => flushOutbox());
      },

      discard(clientMessageId) {
        void setOutbox(outboxRef.current.filter((o) => o.clientMessageId !== clientMessageId));
      },

      setActiveConversation(id) {
        activeRef.current = id;
        if (id) markSeen(id);
      },

      async resetLocalData() {
        const uid = userRef.current;
        if (!uid) return;
        await flushOutbox().catch(() => {});
        await localStore.clear(uid);
      },
    }),
    [
      userId,
      status,
      conversations,
      messages,
      outbox,
      presence,
      hasOlder,
      friendsVersion,
      refreshConversations,
      ensureLoaded,
      catchUp,
      authedRequest,
      mergeInto,
      setOutbox,
      flushOutbox,
      markSeen,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}
