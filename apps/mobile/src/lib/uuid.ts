import * as Crypto from 'expo-crypto';

/**
 * UUID v4. On web, crypto.randomUUID only exists on secure origins (https/localhost), so
 * fall back to building one from getRandomValues, which works everywhere.
 */
export function uuid(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    const b = Crypto.getRandomBytes(16);
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}
