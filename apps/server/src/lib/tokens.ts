import jwt from 'jsonwebtoken';
import type { AgeBracket } from '@anime/shared-types';

const ISSUER = 'anime';
const ACCESS_AUDIENCE = 'access';
const AGE_AUDIENCE = 'age-gate';
const FRIEND_QR_AUDIENCE = 'friend-qr';
export const AGE_TOKEN_TTL_SECONDS = 15 * 60;

/** Token shown as a QR code; scanning it sends a friend request to `sub`. */
export function signFriendQrToken(secret: string, userId: string, ttlSeconds: number) {
  return jwt.sign({}, secret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    audience: FRIEND_QR_AUDIENCE,
    expiresIn: ttlSeconds,
  });
}

export function verifyFriendQrToken(secret: string, token: string): string | null {
  try {
    const p = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: FRIEND_QR_AUDIENCE,
    });
    return typeof p !== 'string' && typeof p.sub === 'string' ? p.sub : null;
  } catch {
    return null;
  }
}

export interface AccessClaims {
  sub: string; // user id
  sid: string; // session id
}

export interface AgeClaims {
  by: number; // birth year
  br: AgeBracket;
  dh: string; // device hash the age gate was passed on
}

export function signAccessToken(secret: string, ttlSeconds: number, claims: AccessClaims) {
  return jwt.sign({ sid: claims.sid }, secret, {
    algorithm: 'HS256',
    subject: claims.sub,
    issuer: ISSUER,
    audience: ACCESS_AUDIENCE,
    expiresIn: ttlSeconds,
  });
}

export function verifyAccessToken(secret: string, token: string): AccessClaims | null {
  try {
    const p = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: ACCESS_AUDIENCE,
    });
    if (typeof p === 'string' || typeof p.sub !== 'string' || typeof p.sid !== 'string')
      return null;
    return { sub: p.sub, sid: p.sid };
  } catch {
    return null;
  }
}

export function signAgeToken(secret: string, claims: AgeClaims) {
  return jwt.sign(claims, secret, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: AGE_AUDIENCE,
    expiresIn: AGE_TOKEN_TTL_SECONDS,
  });
}

export function verifyAgeToken(secret: string, token: string): AgeClaims | null {
  try {
    const p = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AGE_AUDIENCE,
    });
    if (typeof p === 'string') return null;
    const { by, br, dh } = p as Partial<AgeClaims>;
    if (typeof by !== 'number' || (br !== 'teen' && br !== 'adult') || typeof dh !== 'string')
      return null;
    return { by, br, dh };
  } catch {
    return null;
  }
}
