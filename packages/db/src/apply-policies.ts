import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/** Applies sql/policies.sql. Run: `pnpm --filter db policies` (needs DATABASE_URL_DIRECT). */
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
