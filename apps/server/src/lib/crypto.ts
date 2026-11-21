import crypto from 'node:crypto';

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const hmacSha256 = (secret: string, value: string) =>
  crypto.createHmac('sha256', secret).update(value).digest('hex');

/** Opaque, URL-safe random token (used for refresh tokens). */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const randomDigits = (length: number) =>
  Array.from({ length }, () => crypto.randomInt(0, 10)).join('');

export function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
