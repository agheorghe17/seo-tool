import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

// Load the repo-root .env (drizzle-kit doesn't do this itself).
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m?.[1] && process.env[m[1]] === undefined) {
      process.env[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '');
    }
  }
}

/**
 * Migrations run against the SESSION pooler / direct connection (port 5432).
 * Apps/worker use the pooled `DATABASE_URL` (6543) at runtime.
 */
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error('Set DATABASE_URL_DIRECT (or DATABASE_URL) to run drizzle-kit');
}

export default defineConfig({
  // Built JS (run `pnpm --filter db build` first; the `generate`/`push` scripts do this for you).
  schema: './dist/schema/index.js',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
