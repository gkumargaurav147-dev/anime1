import { Pool } from 'pg';
import { buildApp } from './app';
import { loadConfig } from './config';
import { runMigrations } from './db/migrate';
import { createSmsProvider } from './sms/provider';

async function main() {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  await runMigrations(pool, (m) => console.log(`[migrate] ${m}`));

  const sms = createSmsProvider(config.SMS_PROVIDER);
  if (config.NODE_ENV === 'production' && sms.name === 'dev') {
    console.warn('WARNING: dev SMS provider in production; OTP codes are only logged.');
  }

  const app = await buildApp({ config, pool, sms });
  app.addHook('onClose', async () => pool.end());

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
