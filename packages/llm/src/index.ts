import { createHash } from 'node:crypto';
import type { LlmProvider } from 'shared';
import { anthropicAdapter } from './adapters/anthropic.js';
import { noneAdapter } from './adapters/none.js';
import { ollamaAdapter } from './adapters/ollama.js';
import { explanationIsGrounded } from './guardrail.js';
import type { Explanation, LlmAdapter, LlmCache, StructuredIssue } from './types.js';

export * from './types.js';
export { explanationIsGrounded } from './guardrail.js';
export { SYSTEM_PROMPT, buildUserPrompt, parseExplanationJson } from './prompt.js';

const ADAPTERS: Record<LlmProvider, LlmAdapter> = {
  none: noneAdapter,
  anthropic: anthropicAdapter,
  ollama: ollamaAdapter,
};

const CACHE_TTL_SECONDS = Number(process.env.LLM_CACHE_TTL_SECONDS ?? 60 * 60 * 24 * 30);

export function resolveProvider(): LlmProvider {
  const v = process.env.LLM_PROVIDER;
  if (v === 'anthropic' || v === 'ollama' || v === 'none') return v;
  return 'none';
}

export function getAdapter(provider: LlmProvider = resolveProvider()): LlmAdapter {
  return ADAPTERS[provider] ?? noneAdapter;
}

/** Epic 5.3.4 — cache key: identical (rule, version, detected value) → identical explanation. */
export function explanationCacheKey(provider: LlmProvider, issue: StructuredIssue): string {
  const h = createHash('sha256')
    .update(`${issue.ruleId}|${issue.ruleVersion}|${issue.detectedValue ?? ''}`)
    .digest('hex')
    .slice(0, 24);
  return `llm:explain:${provider}:${h}`;
}

export interface ExplainOptions {
  adapter?: LlmAdapter;
  cache?: LlmCache;
}

/**
 * Generate an explanation for a structured issue.
 * Order: cache → model (guardrail-checked) → catalog fallback (`none` adapter).
 */
export async function explainIssue(
  issue: StructuredIssue,
  opts: ExplainOptions = {},
): Promise<Explanation> {
  const adapter = opts.adapter ?? getAdapter();

  if (adapter.provider === 'none') {
    return adapter.explain(issue);
  }

  const key = explanationCacheKey(adapter.provider, issue);
  if (opts.cache) {
    const cached = await opts.cache.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as Explanation;
  }

  let explanation: Explanation | null = null;
  try {
    const candidate = await adapter.explain(issue);
    if (explanationIsGrounded(issue, candidate)) explanation = candidate;
  } catch {
    /* fall through to catalog */
  }

  const result = explanation ?? (await noneAdapter.explain(issue));
  if (opts.cache && explanation) {
    await opts.cache.set(key, JSON.stringify(result), CACHE_TTL_SECONDS).catch(() => {});
  }
  return result;
}
