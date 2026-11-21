import { KEYS, storage } from './storage';
import { uuid } from './uuid';

let cached: string | null = null;

/**
 * Stable per-install device id, kept in secure storage (on iOS the Keychain survives
 * reinstalls). The server only ever stores a hash of it.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id = await storage.get(KEYS.deviceId);
  if (!id) {
    id = uuid();
    await storage.set(KEYS.deviceId, id);
  }
  cached = id;
  return id;
}
