import {
  SCORE_CATEGORIES,
  clampScore,
  siteScore as siteScoreMath,
  weightedTotal,
  type CategoryScores,
  type CategoryWeights,
  type PageData,
  type ScoreCategory,
} from 'shared';
import { ALL_RULES } from './rules/index.js';
import type { Rule, RuleContext, RuleIssue } from './rule.js';

export interface ScoreResult {
  scores: CategoryScores;
  issues: RuleIssue[];
}

function emptyPenalties(): Record<ScoreCategory, number> {
  return { technical: 0, cwv: 0, onpage: 0, content: 0, geo: 0 };
}

/**
 * Run every rule against a page and produce category scores + issues. PURE.
 * Each category starts at 100 and loses `penalty` points per failed rule (floored at 0).
 */
export function scorePage(
  page: PageData,
  ctx: RuleContext,
  opts: { rules?: Rule[]; weights?: CategoryWeights } = {},
): ScoreResult {
  const rules = opts.rules ?? ALL_RULES;
  const penalties = emptyPenalties();
  const issues: RuleIssue[] = [];

  for (const rule of rules) {
    const result = rule.check(page, ctx);
    if (result.passed) continue;
    penalties[rule.category] += rule.penalty;
    issues.push({
      ruleId: rule.id,
      ruleVersion: rule.version,
      category: rule.category,
      severity: rule.severity,
      description: result.description ?? rule.fixTitle,
      detectedValue: result.detectedValue ?? null,
      siteLevel: rule.siteLevel ?? false,
      fixTitle: rule.fixTitle,
      impactHint: rule.impactHint,
      effortHint: rule.effortHint,
      penalty: rule.penalty,
    });
  }

  const perCategory = Object.fromEntries(
    SCORE_CATEGORIES.map((cat) => [cat, clampScore(100 - penalties[cat])]),
  ) as Record<ScoreCategory, number>;

  const scores: CategoryScores = {
    ...perCategory,
    total: weightedTotal(perCategory, opts.weights),
  };

  return { scores, issues };
}

export interface SiteFacts {
  hasSitemap: boolean;
  https: boolean;
  robotsTxtOk: boolean;
}

export interface SiteScoreResult {
  score: number;
  /** Points subtracted from the mean page score. */
  penalty: number;
  issues: RuleIssue[];
}

/** Epic 4.7 — aggregate page totals into a site score, penalising site-level problems. */
export function scoreSite(pageTotals: number[], facts: SiteFacts): SiteScoreResult {
  const issues: RuleIssue[] = [];
  let penalty = 0;

  const add = (
    id: string,
    severity: RuleIssue['severity'],
    p: number,
    description: string,
    fixTitle: string,
    impactHint: number,
    effortHint: number,
  ) => {
    penalty += p;
    issues.push({
      ruleId: id,
      ruleVersion: 1,
      category: 'technical',
      severity,
      description,
      detectedValue: null,
      siteLevel: true,
      fixTitle,
      impactHint,
      effortHint,
      penalty: p,
    });
  };

  if (!facts.https) {
    add('site.https', 'critical', 15, 'Site-ul nu servește integral prin HTTPS.', 'Activează HTTPS pe tot site-ul', 5, 3);
  }
  if (!facts.hasSitemap) {
    add('site.sitemap', 'warning', 8, 'Nu a fost găsit un sitemap.xml valid.', 'Publică un sitemap.xml și trimite-l în Search Console', 4, 2);
  }
  if (!facts.robotsTxtOk) {
    add('site.robots', 'warning', 5, 'robots.txt lipsește sau are probleme.', 'Adaugă un robots.txt corect', 3, 1);
  }

  return { score: siteScoreMath(pageTotals, penalty), penalty, issues };
}

export type { PageData };
