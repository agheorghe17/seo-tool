/**
 * Pure helpers for combining category scores into a page score, and page scores into a site score.
 * No I/O. Used by `packages/scoring` and the `score` worker job.
 */
import type { CategoryScores, ScoreCategory } from './types.js';

export type CategoryWeights = Record<ScoreCategory, number>;

/** Default category weights (see ARCHITECTURE.md). Overridable at runtime via a validated config file. */
export const DEFAULT_WEIGHTS: CategoryWeights = {
  technical: 0.3,
  cwv: 0.15,
  onpage: 0.25,
  content: 0.2,
  geo: 0.1,
};

export function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Weighted mean of the five category scores → the page total (0-100). */
export function weightedTotal(
  categories: Omit<CategoryScores, 'total'>,
  weights: CategoryWeights = DEFAULT_WEIGHTS,
): number {
  const entries = Object.entries(weights) as [ScoreCategory, number][];
  const weightSum = entries.reduce((acc, [, w]) => acc + w, 0);
  if (weightSum === 0) return 0;
  const sum = entries.reduce((acc, [cat, w]) => acc + clampScore(categories[cat]) * w, 0);
  return clampScore(sum / weightSum);
}

/**
 * Site score = mean of page totals, minus a penalty for unresolved site-level problems.
 * `siteLevelPenalty` is the total points to subtract (e.g. 15 for missing sitemap + no HTTPS).
 */
export function siteScore(pageTotals: number[], siteLevelPenalty = 0): number {
  if (pageTotals.length === 0) return 0;
  const mean = pageTotals.reduce((acc, n) => acc + clampScore(n), 0) / pageTotals.length;
  return clampScore(mean - siteLevelPenalty);
}
