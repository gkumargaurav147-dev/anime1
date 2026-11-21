import type { ErrorCode } from '@anime/shared-types';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const unauthorized = (message = 'Not signed in.') =>
  new AppError(401, 'UNAUTHORIZED', message);
