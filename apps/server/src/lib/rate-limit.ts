import type { Config } from '../config';

/** Per-route rate limit config applied to every auth route (keyed per IP, per route). */
export const authRateLimit = (config: Config) => ({
  rateLimit: { max: config.AUTH_RATE_LIMIT_MAX, timeWindow: config.AUTH_RATE_LIMIT_WINDOW_MS },
});
