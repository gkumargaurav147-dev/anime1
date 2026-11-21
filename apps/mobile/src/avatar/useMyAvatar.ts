import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AvatarConfigSchema, randomAvatar, type AvatarConfig } from '@anime/scene-engine';
import type { AvatarResponse } from '@anime/shared-types';
import { useAuth } from '@/auth/AuthContext';

const cacheKey = (userId: string) => `avatar:${userId}`;

/**
 * The signed-in user's avatar: cached on device, loaded from the server, saved with PUT.
 * Until one is saved, a deterministic default derived from the user id is shown.
 */
export function useMyAvatar() {
  const { session, authedRequest } = useAuth();
  const userId = session?.user.id ?? 'anonymous';
  const [avatar, setAvatar] = useState<AvatarConfig>(() => randomAvatar(`avatar:${userId}`));
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey(userId));
        const parsed = cached ? AvatarConfigSchema.safeParse(JSON.parse(cached)) : null;
        if (live && parsed?.success) {
          setAvatar(parsed.data);
          setSaved(true);
        }
        const res = await authedRequest<AvatarResponse>('/me/avatar');
        const server = res.avatar ? AvatarConfigSchema.safeParse(res.avatar) : null;
        if (live && server?.success) {
          setAvatar(server.data);
          setSaved(true);
          await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(server.data));
        }
      } catch {
        // Offline: keep the cached or default avatar.
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [userId, authedRequest]);

  const save = useCallback(
    async (next: AvatarConfig) => {
      const valid = AvatarConfigSchema.parse(next);
      await authedRequest<AvatarResponse>('/me/avatar', { method: 'PUT', body: { avatar: valid } });
      await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(valid));
      setAvatar(valid);
      setSaved(true);
    },
    [authedRequest, userId],
  );

  return { avatar, saved, loading, save, avatarId: userId };
}
