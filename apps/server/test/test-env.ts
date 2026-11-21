import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://anime:anime@localhost:5432/anime_test';
