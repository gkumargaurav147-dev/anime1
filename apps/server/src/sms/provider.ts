/** Anything that can deliver an SMS. Swap in Twilio/SNS/etc. later behind this interface. */
export interface SmsProvider {
  readonly name: string;
  send(toE164: string, body: string): Promise<void>;
}

/**
 * Development stub: never sends anything, just logs. Keeps an in-memory outbox so tests
 * (and local debugging) can read the last code that was "sent".
 */
export class DevSmsProvider implements SmsProvider {
  readonly name = 'dev';
  readonly outbox: { to: string; body: string; at: Date }[] = [];

  constructor(private readonly log: (msg: string) => void = console.log) {}

  async send(toE164: string, body: string) {
    this.outbox.push({ to: toE164, body, at: new Date() });
    if (this.outbox.length > 100) this.outbox.shift();
    this.log(`[dev-sms] to=${toE164} body="${body}"`);
  }

  lastTo(toE164: string) {
    return [...this.outbox].reverse().find((m) => m.to === toE164);
  }
}

export function createSmsProvider(kind: 'dev', log?: (msg: string) => void): SmsProvider {
  switch (kind) {
    case 'dev':
      return new DevSmsProvider(log);
  }
}
