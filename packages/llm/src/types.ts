import type { LlmProvider, Severity } from 'shared';

/**
 * The ONLY thing an adapter receives. No raw page HTML — structured facts only,
 * so the model cannot invent details (anti-hallucination, see ARCHITECTURE.md).
 */
export interface StructuredIssue {
  ruleId: string;
  category: string;
  severity: Severity;
  /** Short, factual description produced by the rule (e.g. "title is 74 chars"). */
  description: string;
  detectedValue: string | null;
  /** Predefined fix title from the rule catalog. */
  fixTitle: string;
  /** Page context, minimal and factual. */
  pageUrl: string;
}

export interface Explanation {
  text: string;
  steps: string[];
  provider: LlmProvider;
}

export interface LlmAdapter {
  provider: LlmProvider;
  explain(issue: StructuredIssue): Promise<Explanation>;
}
