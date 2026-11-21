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
import type {
  AgeGateRequest,
  AgeGateResponse,
  AuthResponse,
  MeResponse,
  PublicUser,
} from '@anime/shared-types';
import { ApiRequestError, apiRequest, type RequestOptions } from '../lib/api';
import { KEYS, storage } from '../lib/storage';

interface Session {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

type AgeGateResult =
  { ok: true; ageBracket: PublicUser['ageBracket'] } | { ok: false; blockedUntil: number };

interface AuthContextValue {
  ready: boolean;
  session: Session | null;
  /** Set after passing the age gate; consumed by signup. */
  ageToken: string | null;
  submitAgeGate: (dob: AgeGateRequest) => Promise<AgeGateResult>;
  localBlockedUntil: () => Promise<number | null>;
  signup: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  /** Authenticated request with transparent access-token refresh. */
  authedRequest: <T>(path: string, opts?: Omit<RequestOptions, 'accessToken'>) => Promise<T>;
  /** Current access token (for the WebSocket auth frame). */
  getAccessToken: () => string | null;
  /** Forces a token refresh; resolves to the new access token, or null if signed out. */
  refreshAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSessionState] = useState<Session | null>(null);
  const [ageToken, setAgeToken] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const refreshing = useRef<Promise<Session | null> | null>(null);

  const setSession = useCallback(async (next: Session | null) => {
    sessionRef.current = next;
    setSessionState(next);
    if (next) await storage.set(KEYS.session, JSON.stringify(next));
    else await storage.remove(KEYS.session);
  }, []);

  const fromAuth = (r: AuthResponse): Session => ({
    user: r.user,
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
  });

  /** Single-flight refresh so parallel 401s don't each rotate (and trip reuse detection). */
  const refresh = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return null;
    refreshing.current ??= apiRequest<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: current.refreshToken },
    })
      .then(async (r) => {
        const next = fromAuth(r);
        await setSession(next);
        return next;
      })
      .catch(async (e) => {
        if (e instanceof ApiRequestError && e.status === 401) await setSession(null);
        return null;
      })
      .finally(() => {
        refreshing.current = null;
      });
    return refreshing.current;
  }, [setSession]);

  const authedRequest = useCallback(
    async <T,>(path: string, opts: Omit<RequestOptions, 'accessToken'> = {}): Promise<T> => {
      const s = sessionRef.current;
      if (!s) throw new ApiRequestError(401, 'UNAUTHORIZED', 'Not signed in.');
      try {
        return await apiRequest<T>(path, { ...opts, accessToken: s.accessToken });
      } catch (e) {
        if (!(e instanceof ApiRequestError) || e.status !== 401 || e.code === 'INVALID_CREDENTIALS')
          throw e;
        const next = await refresh();
        if (!next) throw e;
        return apiRequest<T>(path, { ...opts, accessToken: next.accessToken });
      }
    },
    [refresh],
  );

  // Restore a saved session on launch and confirm it is still valid.
  useEffect(() => {
    (async () => {
      try {
        const raw = await storage.get(KEYS.session);
        if (raw) {
          sessionRef.current = JSON.parse(raw) as Session;
          setSessionState(sessionRef.current);
          const me = await authedRequest<MeResponse>('/me').catch(() => null);
          if (me && sessionRef.current) await setSession({ ...sessionRef.current, user: me.user });
        }
      } finally {
        setReady(true);
      }
    })();
  }, [authedRequest, setSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      ageToken,
      authedRequest,
      getAccessToken: () => sessionRef.current?.accessToken ?? null,
      refreshAccessToken: async () => (await refresh())?.accessToken ?? null,

      async localBlockedUntil() {
        const v = Number(await storage.get(KEYS.ageBlockedUntil));
        return v && v > Date.now() ? v : null;
      },

      async submitAgeGate(dob) {
        try {
          const r = await apiRequest<AgeGateResponse>('/age-gate', { method: 'POST', body: dob });
          setAgeToken(r.ageToken);
          return { ok: true, ageBracket: r.ageBracket };
        } catch (e) {
          if (e instanceof ApiRequestError && e.code === 'AGE_BLOCKED') {
            const retry = (e.body as { retryAfterSeconds?: number })?.retryAfterSeconds ?? 86400;
            const until = Date.now() + retry * 1000;
            await storage.set(KEYS.ageBlockedUntil, String(until));
            setAgeToken(null);
            return { ok: false, blockedUntil: until };
          }
          throw e;
        }
      },

      async signup(username, password) {
        if (!ageToken)
          throw new ApiRequestError(
            400,
            'AGE_TOKEN_INVALID',
            'Please confirm your date of birth again.',
          );
        const r = await apiRequest<AuthResponse>('/auth/signup', {
          method: 'POST',
          body: { username, password, ageToken },
        });
        setAgeToken(null);
        await setSession(fromAuth(r));
      },

      async login(username, password) {
        const r = await apiRequest<AuthResponse>('/auth/login', {
          method: 'POST',
          body: { username, password },
        });
        await setSession(fromAuth(r));
      },

      async logout() {
        await authedRequest('/auth/logout', { method: 'POST' }).catch(() => {});
        await setSession(null);
      },

      async logoutAll() {
        await authedRequest('/auth/logout-all', { method: 'POST' });
        await setSession(null);
      },

      async deleteAccount(password) {
        await authedRequest('/me', { method: 'DELETE', body: { password } });
        await setSession(null);
      },
    }),
    [ready, session, ageToken, authedRequest, refresh, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
