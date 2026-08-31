/**
 * Impact × effort prioritisation for recommendations (Epic 5.2).
 * Pure. `impact` and `effort` are 1..5 hints from the rule catalog.
 */

export interface PriorityInput {
  /** How much fixing this could move the needle. 1 = negligible, 5 = major. */
  impact: number;
  /** How hard it is to implement. 1 = trivial (edit a tag), 5 = structural. */
  effort: number;
  /** Critical issues float to the top regardless of the raw ratio. */
  critical?: boolean;
}

export interface Prioritised extends PriorityInput {
  /** Higher = do sooner. */
  score: number;
  /** 1-based rank after sorting a list. */
  rank: number;
}

function clamp15(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}

/** Raw priority score for a single item. */
export function priorityScore({ impact, effort, critical }: PriorityInput): number {
  const i = clamp15(impact);
  const e = clamp15(effort);
  const base = (i * i) / e; // impact matters quadratically, effort linearly
  return critical ? base + 100 : base;
}

/** Sort a list by priority (desc) and attach `score` + `rank`. Stable for equal scores. */
export function prioritise<T extends PriorityInput>(items: T[]): (T & Prioritised)[] {
  return items
    .map((item) => ({ ...item, score: priorityScore(item), rank: 0 }))
    .sort((a, b) => b.score - a.score)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}
