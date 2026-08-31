import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

/**
 * Runtime client for apps + worker. Uses the pooled `DATABASE_URL`.
 * Migrations use a separate direct connection via drizzle-kit (see drizzle.config.ts).
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// `prepare: false` is required when going through a transaction pooler (Supabase / pgBouncer).
const queryClient = postgres(connectionString, { prepare: false });

export const db = drizzle(queryClient, { schema });
export { schema };
export type Db = typeof db;
