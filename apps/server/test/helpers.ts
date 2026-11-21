import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import request from 'supertest';
import type { AgeGateResponse, AuthResponse } from '@anime/shared-types';
import { buildApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import { DevSmsProvider } from '../src/sms/provider';
import { TEST_DATABASE_URL } from './test-env';

export interface TestCtx {
  app: FastifyInstance;
  pool: Pool;
  sms: DevSmsProvider;
  config: Config;
  wsUrl: string;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createTestApp(overrides: Partial<Record<keyof Config, unknown>> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: undefined, // in-memory rate limit store unless a test opts in
    JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-1234',
    AUTH_RATE_LIMIT_MAX: 1000,
    ...overrides,
  });
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const sms = new DevSmsProvider(() => {});
  const app = await buildApp({ config, pool, sms });
  // Listen on a random port so WebSocket tests can connect.
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const ctx: TestCtx = {
    app,
    pool,
    sms,
    config,
    wsUrl: `${address.replace(/^http/, 'ws')}/ws`,
    http: () => request(app.server),
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
  return ctx;
}

const TABLES = [
  'avatars',
  'messages',
  'conversation_members',
  'conversations',
  'friendships',
  'blocks',
  'reports',
  'otp_codes',
  'sessions',
  'devices',
  'credentials',
  'users',
  'age_gate_blocks',
];

export async function resetDb(pool: Pool) {
  await pool.query(`TRUNCATE ${TABLES.join(', ')} CASCADE`);
}

export const newDeviceId = () => crypto.randomUUID();

/** A date of birth that makes someone exactly `age` today (birthday was yesterday). */
export function dobForAge(age: number) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - age);
  d.setUTCDate(d.getUTCDate() - 1);
  return {
    birthYear: d.getUTCFullYear(),
    birthMonth: d.getUTCMonth() + 1,
    birthDay: d.getUTCDate(),
  };
}

export function ageGate(ctx: TestCtx, deviceId: string, age: number) {
  return ctx.http().post('/age-gate').set('x-device-id', deviceId).send(dobForAge(age));
}

let counter = 0;
export const uniqueUsername = (prefix = 'user') => `${prefix}_${Date.now() % 1e6}_${counter++}`;

/** Passes the age gate and signs up; returns the auth response and the credentials used. */
export async function signupUser(
  ctx: TestCtx,
  opts: { age?: number; username?: string; password?: string; deviceId?: string } = {},
) {
  const deviceId = opts.deviceId ?? newDeviceId();
  const username = opts.username ?? uniqueUsername();
  const password = opts.password ?? 'correct-horse-battery';
  const gate = await ageGate(ctx, deviceId, opts.age ?? 25).expect(200);
  const { ageToken } = gate.body as AgeGateResponse;
  const res = await ctx
    .http()
    .post('/auth/signup')
    .set('x-device-id', deviceId)
    .send({ username, password, ageToken })
    .expect(201);
  return { auth: res.body as AuthResponse, username, password, deviceId };
}
