import { sql } from 'drizzle-orm';
import { db, llmUsage } from 'db';
import { completeJson, resolveProvider, type CompleteOptions } from 'llm';
import { logger } from '../logger.js';

/**
 * Budget guard around the LLM. A free-tier key (Gemini / Groq) can NEVER be pushed
 * past quota because:
 *   - a hard per-day call cap tracked in `llm_usage` (persists across restarts),
 *   - a minimum interval between calls (stays under RPM limits),
 *   - and every failure path returns null → the caller uses its deterministic fallback.
 */
const DAILY_MAX = Number(process.env.LLM_DAILY_MAX ?? 150);
const MIN_INTERVAL_MS = Number(process.env.LLM_MIN_INTERVAL_MS ?? 5_000);

let lastCallAt = 0;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Reserve one call for today. Returns false when the daily cap is already reached. */
async function reserve(): Promise<boolean> {
  const day = today();
  try {
    const [row] = await db
      .insert(llmUsage)
      .values({ day, calls: 1 })
      .onConflictDoUpdate({
        target: llmUsage.day,
        set: { calls: sql`${llmUsage.calls} + 1`, updatedAt: new Date() },
      })
      .returning({ calls: llmUsage.calls });
    if ((row?.calls ?? 0) > DAILY_MAX) {
      logger.warn({ day, calls: row?.calls, cap: DAILY_MAX }, 'llm daily cap reached — using fallback');
      return false;
    }
    return true;
  } catch (err) {
    // If we can't even track usage, don't risk uncapped spend.
    logger.warn({ err }, 'llm usage tracking failed — skipping call');
    return false;
  }
}

async function throttle(): Promise<void> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

/**
 * Guarded `completeJson`. Drop-in for the worker: same signature, but returns null
 * (→ deterministic fallback) when the provider is `none`, the daily cap is hit, or
 * the call fails.
 */
function providerReady(): boolean {
  const p = resolveProvider();
  if (p === 'none') return false;
  if (p === 'gemini') return !!process.env.GEMINI_API_KEY;
  if (p === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  return true; // ollama — assume the local endpoint is up
}

export async function guardedCompleteJson<T>(
  system: string,
  user: string,
  opts: CompleteOptions = {},
): Promise<T | null> {
  // Check the provider is actually usable BEFORE spending from the daily budget.
  if (!providerReady()) return null;
  if (!(await reserve())) return null;
  await throttle();
  return completeJson<T>(system, user, opts);
}

/** Today's usage, for the cost view. */
export async function llmUsageToday(): Promise<{ day: string; calls: number; cap: number }> {
  const day = today();
  try {
    const [row] = await db.select().from(llmUsage).where(sql`${llmUsage.day} = ${day}`);
    return { day, calls: row?.calls ?? 0, cap: DAILY_MAX };
  } catch {
    return { day, calls: 0, cap: DAILY_MAX };
  }
}
