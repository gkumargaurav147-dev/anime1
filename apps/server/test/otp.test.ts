import { createTestApp, resetDb, signupUser, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.pool));

const codeFrom = (body: string) => body.match(/\d{6}/)![0];

describe('phone OTP (dev SMS stub)', () => {
  it('sends a code through the provider and verifies the phone', async () => {
    const { auth } = await signupUser(ctx);
    const bearer = `Bearer ${auth.accessToken}`;
    const phone = '+447700900123';

    await ctx
      .http()
      .post('/auth/otp/request')
      .set('authorization', bearer)
      .send({ phone })
      .expect(202);
    const msg = ctx.sms.lastTo(phone);
    expect(msg).toBeDefined();

    const { rows } = await ctx.pool.query('SELECT code_hash FROM otp_codes');
    expect(rows[0].code_hash).not.toContain(codeFrom(msg!.body));

    const res = await ctx
      .http()
      .post('/auth/otp/verify')
      .set('authorization', bearer)
      .send({ phone, code: codeFrom(msg!.body) })
      .expect(200);
    expect(res.body.user.phoneVerified).toBe(true);
  });

  it('rejects wrong codes and locks after too many attempts', async () => {
    const { auth } = await signupUser(ctx);
    const bearer = `Bearer ${auth.accessToken}`;
    const phone = '+14155550199';
    await ctx
      .http()
      .post('/auth/otp/request')
      .set('authorization', bearer)
      .send({ phone })
      .expect(202);
    const real = codeFrom(ctx.sms.lastTo(phone)!.body);
    const wrong = real === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      const r = await ctx
        .http()
        .post('/auth/otp/verify')
        .set('authorization', bearer)
        .send({ phone, code: wrong })
        .expect(400);
      expect(r.body.error.code).toBe('OTP_INVALID');
    }
    const locked = await ctx
      .http()
      .post('/auth/otp/verify')
      .set('authorization', bearer)
      .send({ phone, code: real })
      .expect(400);
    expect(locked.body.error.code).toBe('OTP_EXPIRED');
  });
});
