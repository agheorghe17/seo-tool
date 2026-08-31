import type { LlmProvider, Severity } from 'shared';

/**
 * The ONLY thing an adapter receives. No raw page HTML — structured facts only,
 * so the model cannot invent details (anti-hallucination, see ARCHITECTURE.md).
 */
export interface StructuredIssue {
  ruleId: string;
  ruleVersion: number;
  category: string;
  severity: Severity;
  /** Short, factual description produced by the rule (e.g. "title is 74 chars"). */
  description: string;
  detectedValue: string | null;
  /** Predefined fix title from the rule catalog. */
  fixTitle: string;
  /** Deterministic remediation steps from the catalog — the model rewrites these into prose. */
  catalogSteps: string[];
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

/** Minimal cache surface (Epic 5.3.4). The worker passes a Redis-backed store. */
export interface LlmCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}
