import { sql } from 'drizzle-orm';
import { db, llmUsage } from 'db';
import { completeJson, resolveProvider, type CompleteOptions } from 'llm';

/**
 * API-side budget guard, sharing the `llm_usage` table with the worker so the
 * per-day cap is global. Same contract: returns null → caller uses a deterministic
 * fallback.
 */
const DAILY_MAX = Number(process.env.LLM_DAILY_MAX ?? 150);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function reserve(): Promise<boolean> {
  try {
    const [row] = await db
      .insert(llmUsage)
      .values({ day: today(), calls: 1 })
      .onConflictDoUpdate({
        target: llmUsage.day,
        set: { calls: sql`${llmUsage.calls} + 1`, updatedAt: new Date() },
      })
      .returning({ calls: llmUsage.calls });
    return (row?.calls ?? 0) <= DAILY_MAX;
  } catch {
    return false;
  }
}

function providerReady(): boolean {
  const p = resolveProvider();
  if (p === 'none') return false;
  if (p === 'gemini') return !!process.env.GEMINI_API_KEY;
  if (p === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  return true;
}

export async function guardedCompleteJson<T>(
  system: string,
  user: string,
  opts: CompleteOptions = {},
): Promise<T | null> {
  if (!providerReady()) return null;
  if (!(await reserve())) return null;
  return completeJson<T>(system, user, opts);
}
