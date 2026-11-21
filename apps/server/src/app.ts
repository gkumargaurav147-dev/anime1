import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import type { Pool } from 'pg';
import { ZodError } from 'zod';
import type { ApiError } from '@anime/shared-types';
import type { Config } from './config';
import { AppError } from './errors';
import type { SmsProvider } from './sms/provider';
import { registerAuthDecorators } from './plugins/auth';
import { ageGateRoutes } from './routes/age-gate';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { otpRoutes } from './routes/otp';
import { friendRoutes } from './routes/friends';
import { conversationRoutes } from './routes/conversations';
import { LocalBus, RedisBus, type EventBus } from './realtime/bus';
import { registerGateway } from './realtime/gateway';
import { MemoryPresenceStore, RedisPresenceStore, type PresenceStore } from './realtime/presence';

export interface AppDeps {
  config: Config;
  pool: Pool;
  sms: SmsProvider;
  /** Defaults: Redis-backed when REDIS_URL is set, in-memory otherwise. */
  bus?: EventBus;
  presence?: PresenceStore;
}

/** Dependencies after buildApp has filled in the realtime pieces. */
export interface Ctx extends AppDeps {
  bus: EventBus;
  presence: PresenceStore;
}

export async function buildApp(
  deps: AppDeps,
  opts: FastifyServerOptions = {},
): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: 'info' },
    ...opts,
  });

  await app.register(cors, { origin: config.NODE_ENV === 'production' ? false : true });

  let redis: Redis | undefined;
  if (config.REDIS_URL) {
    redis = new Redis(config.REDIS_URL, { connectTimeout: 1000, maxRetriesPerRequest: 1 });
    redis.on('error', (err) =>
      app.log.warn({ err }, 'redis error (rate limiting falls back open)'),
    );
    app.addHook('onClose', async () => {
      await redis?.quit().catch(() => {});
    });
  }

  // Not global: only routes that opt in via `config.rateLimit` are limited (all auth routes do).
  await app.register(rateLimit, {
    global: false,
    redis,
    nameSpace: 'anime-rl:',
    skipOnError: true,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: { code: 'RATE_LIMITED', message: `Too many requests. Try again in ${ctx.after}.` },
    }),
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      const body: ApiError = { error: { code: err.code, message: err.message } };
      return reply.status(err.statusCode).send({ ...body, ...err.extra });
    }
    if (err instanceof ZodError) {
      const message = err.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ');
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message } });
    }
    const e = err as { statusCode?: number; message?: string; error?: unknown };
    if (e.statusCode === 429) {
      return reply
        .status(429)
        .send({ error: e.error ?? { code: 'RATE_LIMITED', message: 'Too many requests.' } });
    }
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply
        .status(e.statusCode)
        .send({ error: { code: 'VALIDATION_ERROR', message: e.message ?? 'Bad request' } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found.' } }),
  );

  registerAuthDecorators(app, deps);

  const ctx: Ctx = {
    ...deps,
    bus: deps.bus ?? (redis ? new RedisBus(redis) : new LocalBus()),
    presence:
      deps.presence ??
      (redis
        ? new RedisPresenceStore(redis, config.PRESENCE_TTL_SECONDS)
        : new MemoryPresenceStore(config.PRESENCE_TTL_SECONDS)),
  };
  app.addHook('onClose', async () => ctx.bus.close());

  app.get('/health', async () => ({ ok: true }));
  await app.register(ageGateRoutes(ctx));
  await app.register(authRoutes(ctx));
  await app.register(meRoutes(ctx));
  await app.register(otpRoutes(ctx));
  await app.register(friendRoutes(ctx));
  await app.register(conversationRoutes(ctx));
  await app.register(async (scope) => registerGateway(scope, ctx));

  return app;
}
