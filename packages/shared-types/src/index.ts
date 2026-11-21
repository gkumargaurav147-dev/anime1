/**
 * API contract shared by @anime/server and @anime/mobile.
 * Keep this package types-only so both sides can import it with `import type`.
 */

/** Only the bracket and birth year are stored; full date of birth never leaves the request. */
export type AgeBracket = 'teen' | 'adult';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AGE_BLOCKED'
  | 'AGE_TOKEN_INVALID'
  | 'DEVICE_ID_REQUIRED'
  | 'USERNAME_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'REFRESH_TOKEN_INVALID'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'PHONE_TAKEN'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NOT_FRIENDS'
  | 'ALREADY_FRIENDS'
  | 'QR_INVALID'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export * from './social';
export * from './realtime';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
  };
}

/** Header every client request carries so the server can apply device-level rules. */
export type DeviceIdHeader = 'x-device-id';

// ----- Age gate -----

export interface AgeGateRequest {
  birthYear: number;
  /** 1-12 */
  birthMonth: number;
  /** 1-31 */
  birthDay: number;
}

export interface AgeGateResponse {
  /** Short-lived token proving this device passed the age gate. Required by /auth/signup. */
  ageToken: string;
  ageBracket: AgeBracket;
  expiresInSeconds: number;
}

/** Returned with 403 AGE_BLOCKED. */
export interface AgeBlockedResponse extends ApiError {
  retryAfterSeconds: number;
}

// ----- Auth -----

export interface SignupRequest {
  username: string;
  password: string;
  ageToken: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  username: string;
  ageBracket: AgeBracket;
  isTeen: boolean;
  phoneVerified: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
}

export interface AuthResponse extends AuthTokens {
  user: PublicUser;
}

export interface MeResponse {
  user: PublicUser;
}

export interface DeleteAccountRequest {
  /** Re-confirm the password before deleting everything. */
  password: string;
}

// ----- Phone OTP -----

export interface OtpRequestBody {
  /** E.164, e.g. +14155550123 */
  phone: string;
}

export interface OtpVerifyBody {
  phone: string;
  code: string;
}
