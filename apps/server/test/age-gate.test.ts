import { ageGate, createTestApp, newDeviceId, resetDb, type TestCtx } from './helpers';
import { computeAge } from '../src/lib/age';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp({ AGE_GATE_COOLDOWN_HOURS: 24 });
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

describe('POST /age-gate', () => {
  it('passes an 18-year-old as adult and a 15-year-old as teen', async () => {
    const adult = await ageGate(ctx, newDeviceId(), 18).expect(200);
    expect(adult.body).toMatchObject({ ageBracket: 'adult', ageToken: expect.any(String) });
    const teen = await ageGate(ctx, newDeviceId(), 15).expect(200);
    expect(teen.body.ageBracket).toBe('teen');
  });

  it('blocks a 10-year-old with a neutral message', async () => {
    const res = await ageGate(ctx, newDeviceId(), 10).expect(403);
    expect(res.body.error.code).toBe('AGE_BLOCKED');
    expect(res.body.error.message).not.toMatch(/13|thirteen|old enough/i);
    expect(res.body.retryAfterSeconds).toBe(24 * 3600);
  });

  it('blocks someone one day short of 13', async () => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 13);
    d.setUTCDate(d.getUTCDate() + 1); // 13th birthday is tomorrow
    await ctx
      .http()
      .post('/age-gate')
      .set('x-device-id', newDeviceId())
      .send({
        birthYear: d.getUTCFullYear(),
        birthMonth: d.getUTCMonth() + 1,
        birthDay: d.getUTCDate(),
      })
      .expect(403);
  });

  it('cannot be bypassed by re-entering an older age on the same device', async () => {
    const deviceId = newDeviceId();
    await ageGate(ctx, deviceId, 10).expect(403);

    const retry = await ageGate(ctx, deviceId, 25).expect(403);
    expect(retry.body.error.code).toBe('AGE_BLOCKED');
    expect(retry.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('cannot be bypassed with an age token obtained before the block', async () => {
    const deviceId = newDeviceId();
    const ok = await ageGate(ctx, deviceId, 25).expect(200);
    await ageGate(ctx, deviceId, 10).expect(403);

    const res = await ctx
      .http()
      .post('/auth/signup')
      .set('x-device-id', deviceId)
      .send({ username: 'sneaky', password: 'password123', ageToken: ok.body.ageToken })
      .expect(403);
    expect(res.body.error.code).toBe('AGE_BLOCKED');
  });

  it('lifts the block once the cooldown has passed', async () => {
    const deviceId = newDeviceId();
    await ageGate(ctx, deviceId, 10).expect(403);
    await ctx.pool.query(`UPDATE age_gate_blocks SET blocked_until = now() - interval '1 second'`);
    await ageGate(ctx, deviceId, 25).expect(200);
  });

  it('does not affect other devices', async () => {
    await ageGate(ctx, newDeviceId(), 10).expect(403);
    await ageGate(ctx, newDeviceId(), 25).expect(200);
  });

  it('stores only a hash of the device id', async () => {
    const deviceId = newDeviceId();
    await ageGate(ctx, deviceId, 10).expect(403);
    const { rows } = await ctx.pool.query('SELECT device_hash FROM age_gate_blocks');
    expect(rows).toHaveLength(1);
    expect(rows[0].device_hash).not.toContain(deviceId);
  });

  it('requires a device id', async () => {
    const res = await ctx
      .http()
      .post('/age-gate')
      .send({ birthYear: 2000, birthMonth: 1, birthDay: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEVICE_ID_REQUIRED');
  });

  it('rejects impossible and future dates', async () => {
    const dev = newDeviceId();
    await ctx
      .http()
      .post('/age-gate')
      .set('x-device-id', dev)
      .send({ birthYear: 2001, birthMonth: 2, birthDay: 30 })
      .expect(400);
    await ctx
      .http()
      .post('/age-gate')
      .set('x-device-id', dev)
      .send({ birthYear: 2099, birthMonth: 1, birthDay: 1 })
      .expect(400);
  });
});

describe('computeAge', () => {
  const now = new Date(Date.UTC(2026, 5, 15)); // 15 June 2026
  it('counts whole years using month and day', () => {
    expect(computeAge(2013, 6, 15, now)).toEqual({ ok: true, age: 13 });
    expect(computeAge(2013, 6, 16, now)).toEqual({ ok: true, age: 12 });
    expect(computeAge(2008, 6, 14, now)).toEqual({ ok: true, age: 18 });
  });
});
