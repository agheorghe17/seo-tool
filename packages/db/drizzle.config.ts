import { defineConfig } from 'drizzle-kit';

/**
 * Migrations run against the DIRECT (non-pooled) connection.
 * Apps/worker use the pooled `DATABASE_URL` at runtime.
 */
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error('Set DATABASE_URL_DIRECT (or DATABASE_URL) to run drizzle-kit');
}

export default defineConfig({
  // Built JS (run `pnpm --filter db build` first; the `generate`/`push` scripts do this for you).
  // drizzle-kit's loader doesn't rewrite NodeNext `.js` specifiers in `.ts` sources.
  schema: './dist/schema/index.js',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
