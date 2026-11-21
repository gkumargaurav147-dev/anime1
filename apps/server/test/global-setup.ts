import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate';
import { TEST_DATABASE_URL } from './test-env';

export default async function globalSetup() {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await runMigrations(pool);
  } catch (err) {
    throw new Error(
      `Could not prepare the test database at ${TEST_DATABASE_URL}. ` +
        `Is Postgres running (npm run db:up)?\n${(err as Error).message}`,
      { cause: err },
    );
  } finally {
    await pool.end();
  }
}
