import fs from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'migrations');

/**
 * Minimal forward-only migration runner: applies migrations/*.sql in filename order,
 * each in its own transaction, recording applied names in schema_migrations.
 */
export async function runMigrations(pool: Pool, log: (msg: string) => void = () => {}) {
  const client = await pool.connect();
  try {
    // Serialise concurrent runners (e.g. parallel test workers).
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (r) => r.name,
      ),
    );
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
}
