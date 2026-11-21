import { Pool } from 'pg';
import { loadConfig } from '../config';
import { runMigrations } from './migrate';

async function main() {
  const url = process.argv.includes('--test')
    ? (process.env.TEST_DATABASE_URL ?? 'postgres://anime:anime@localhost:5432/anime_test')
    : loadConfig().DATABASE_URL;
  const pool = new Pool({ connectionString: url });
  try {
    await runMigrations(pool, (m) => console.log(m));
    console.log('migrations up to date');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
