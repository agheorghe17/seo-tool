import type { LlmAdapter, Explanation, StructuredIssue } from '../types.js';

/**
 * Zero-cost adapter: returns the catalog fix title + the rule's own description,
 * no model call. This is the default (`LLM_PROVIDER=none`).
 */
export const noneAdapter: LlmAdapter = {
  provider: 'none',
  async explain(issue: StructuredIssue): Promise<Explanation> {
    return {
      provider: 'none',
      text: issue.description,
      steps: [issue.fixTitle],
    };
  },
};
