import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/** Applies sql/policies.sql. Run: `pnpm --filter db policies` (needs DATABASE_URL_DIRECT). */

// Load the repo-root .env.
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL_DIRECT (or DATABASE_URL)');
  process.exit(1);
}

const sqlPath = fileURLToPath(new URL('../sql/policies.sql', import.meta.url));
const sqlText = readFileSync(sqlPath, 'utf8');

const sql = postgres(url, { max: 1 });
try {
  await sql.unsafe(sqlText);
  console.log('policies applied');
} catch (err) {
  console.error('failed to apply policies:', err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
