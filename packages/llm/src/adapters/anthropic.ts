import type { LlmAdapter, Explanation, StructuredIssue } from '../types.js';

/**
 * Epic 5.3.1 — Claude adapter. Strict prompt, structured input only, low temperature,
 * hard token cap. Left unimplemented in Epic 0 so the package has no SDK dependency yet.
 */
export const anthropicAdapter: LlmAdapter = {
  provider: 'anthropic',
  async explain(_issue: StructuredIssue): Promise<Explanation> {
    throw new Error('anthropic adapter not implemented — Epic 5.3.1');
  },
};
