import type { LlmAdapter, Explanation, StructuredIssue } from '../types.js';

/**
 * Epic 5.3.2 — local model via Ollama HTTP API (`OLLAMA_BASE_URL`). Same contract, zero cost.
 * Unimplemented in Epic 0.
 */
export const ollamaAdapter: LlmAdapter = {
  provider: 'ollama',
  async explain(_issue: StructuredIssue): Promise<Explanation> {
    throw new Error('ollama adapter not implemented — Epic 5.3.2');
  },
};
