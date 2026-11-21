import Constants from 'expo-constants';
import type { ApiError, ErrorCode } from '@anime/shared-types';
import { getDeviceId } from './device';

/**
 * API base URL. EXPO_PUBLIC_API_URL wins; otherwise use port 3000 on the machine running
 * Metro (works for Expo Go on a phone on the same Wi-Fi, and for simulators).
 */
function resolveBaseUrl() {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:3000`;
}

export const API_URL = resolveBaseUrl();

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  accessToken?: string | null;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'x-device-id': await getDeviceId(),
    accept: 'application/json',
  };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.accessToken) headers.authorization = `Bearer ${opts.accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', `Can't reach the server at ${API_URL}.`);
  }

  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (json as ApiError | null)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? `Request failed (${res.status}).`,
      json,
    );
  }
  return json as T;
}
