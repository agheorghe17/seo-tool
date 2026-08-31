import type { LlmAdapter, Explanation, StructuredIssue } from '../types.js';

/**
 * Zero-cost adapter: returns the catalog fix title + the catalog steps, no model call.
 * This is the default (`LLM_PROVIDER=none`) and the fallback when the guardrail rejects
 * a model response.
 */
export const noneAdapter: LlmAdapter = {
  provider: 'none',
  async explain(issue: StructuredIssue): Promise<Explanation> {
    return {
      provider: 'none',
      text: issue.description,
      steps: issue.catalogSteps.length > 0 ? issue.catalogSteps : [issue.fixTitle],
    };
  },
};
