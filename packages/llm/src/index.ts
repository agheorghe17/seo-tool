import type { LlmProvider } from 'shared';
import { anthropicAdapter } from './adapters/anthropic.js';
import { noneAdapter } from './adapters/none.js';
import { ollamaAdapter } from './adapters/ollama.js';
import { explanationIsGrounded } from './guardrail.js';
import type { Explanation, LlmAdapter, StructuredIssue } from './types.js';

export * from './types.js';
export { explanationIsGrounded } from './guardrail.js';

const ADAPTERS: Record<LlmProvider, LlmAdapter> = {
  none: noneAdapter,
  anthropic: anthropicAdapter,
  ollama: ollamaAdapter,
};

export function getAdapter(provider: LlmProvider = resolveProvider()): LlmAdapter {
  return ADAPTERS[provider] ?? noneAdapter;
}

export function resolveProvider(): LlmProvider {
  const v = process.env.LLM_PROVIDER;
  if (v === 'anthropic' || v === 'ollama' || v === 'none') return v;
  return 'none';
}

/**
 * Generate an explanation for a structured issue. Runs the anti-hallucination guardrail;
 * on failure, falls back to the zero-cost catalog adapter.
 */
export async function explainIssue(issue: StructuredIssue): Promise<Explanation> {
  const adapter = getAdapter();
  if (adapter.provider === 'none') {
    return adapter.explain(issue);
  }
  try {
    const explanation = await adapter.explain(issue);
    if (explanationIsGrounded(issue, explanation)) return explanation;
  } catch {
    // fall through to catalog
  }
  return noneAdapter.explain(issue);
}
