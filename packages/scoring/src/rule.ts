import type { PageData, ScoreCategory, Severity } from 'shared';

/**
 * A scoring rule. PURE: no I/O, no `process.env`, no DB. Given a page, it either
 * returns an `RuleIssue` (rule failed / partially failed) or `null` (rule passed).
 *
 * `penalty` is how many points to subtract from the rule's category score when it fails
 * (0-100 scale, before category weighting). Rules within a category share the 0-100 budget.
 */
export interface Rule {
  id: string;
  version: number;
  category: ScoreCategory;
  severity: Severity;
  /** Human title for the corresponding fix (Epic 5.1 catalog key). */
  fixTitle: string;
  /** 1-5 hints feeding impact×effort prioritisation. */
  impactHint: number;
  effortHint: number;
  /** Points off the category score when this rule fails (0-100). */
  penalty: number;
  /** True if this rule evaluates a whole-site property rather than a single page. */
  siteLevel?: boolean;
  check(page: PageData, ctx: RuleContext): RuleResult;
}

export interface RuleContext {
  /** Other pages in the same crawl — needed for duplicate/cardinality checks. */
  siblings: PageData[];
  /** Site-level facts gathered by the crawler. */
  site: {
    hasSitemap: boolean;
    https: boolean;
    robotsTxtOk: boolean;
  };
  /**
   * Market posture from the site's business profile. `localSeo: false` (national /
   * online-only) suppresses local-only rules (address/phone schema, NAP). Absent =
   * treat as allowed, for callers that don't supply it.
   */
  market?: { localSeo: boolean };
}

export interface RuleResult {
  passed: boolean;
  /** Shown to the user; keep it specific ("title is 74 chars"). */
  description?: string;
  detectedValue?: string | null;
}

export interface RuleIssue {
  ruleId: string;
  ruleVersion: number;
  category: ScoreCategory;
  severity: Severity;
  description: string;
  detectedValue: string | null;
  siteLevel: boolean;
  fixTitle: string;
  impactHint: number;
  effortHint: number;
  penalty: number;
}
