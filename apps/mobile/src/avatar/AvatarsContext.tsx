import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AvatarConfigSchema, type AvatarConfig } from '@anime/scene-engine';
import type { AvatarsResponse } from '@anime/shared-types';
import { useAuth } from '@/auth/AuthContext';
import { useChat } from '@/chat/ChatContext';

interface AvatarsValue {
  avatars: Record<string, AvatarConfig | undefined>;
  /** Make sure these users' avatars are loaded (friends + self only; others stay default). */
  want: (userIds: string[]) => void;
}

const Ctx = createContext<AvatarsValue | null>(null);

/** Cache of saved avatars for you and your friends, refreshed when someone changes theirs. */
export function AvatarsProvider({ children }: { children: ReactNode }) {
  const { session, authedRequest } = useAuth();
  const { avatarVersion } = useChat();
  const [avatars, setAvatars] = useState<Record<string, AvatarConfig | undefined>>({});
  const wanted = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    const ids = [...wanted.current];
    if (!ids.length || !session) return;
    try {
      const res = await authedRequest<AvatarsResponse>(`/avatars?userIds=${ids.join(',')}`);
      const next: Record<string, AvatarConfig> = {};
      for (const a of res.avatars) {
        const parsed = AvatarConfigSchema.safeParse(a.avatar);
        if (parsed.success) next[a.userId] = parsed.data;
      }
      setAvatars((prev) => ({ ...prev, ...next }));
    } catch {
      // Offline: keep what we have (defaults render meanwhile).
    }
  }, [authedRequest, session]);

  const want = useCallback(
    (userIds: string[]) => {
      let added = false;
      for (const id of userIds) {
        if (id && !wanted.current.has(id)) {
          wanted.current.add(id);
          added = true;
        }
      }
      if (!added) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void fetchAll(), 50);
    },
    [fetchAll],
  );

  // Someone saved a new avatar: refetch.
  useEffect(() => {
    if (avatarVersion > 0) void fetchAll();
  }, [avatarVersion, fetchAll]);

  useEffect(() => {
    if (!session) {
      wanted.current.clear();
      setAvatars({});
    }
  }, [session]);

  const value = useMemo(() => ({ avatars, want }), [avatars, want]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAvatars(userIds: string[]) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAvatars must be used inside <AvatarsProvider>');
  const key = userIds.join(',');
  useEffect(() => {
    ctx.want(userIds);
    // key captures the ids
  }, [key]);
  return ctx.avatars;
}
