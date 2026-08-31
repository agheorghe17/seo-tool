/**
 * Organic CTR by SERP position — used only as a FALLBACK baseline when Google Search Console
 * is not connected (see Epic 7.3). When GSC is connected, real clicks/impressions are used instead.
 *
 * These values are placeholders in the shape of published desktop+mobile blended studies
 * (e.g. Advanced Web Ranking, Backlinko). Epic 7.3 must replace them with a single cited source
 * and note the source + date in `traffic_estimates.assumptions_json`.
 *
 * DO NOT present derived numbers as guarantees — the traffic estimator always emits an interval.
 */

/** Blended organic CTR for positions 1..20. Index 0 = position 1. */
export const CTR_BY_POSITION: readonly number[] = [
  0.27, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.032, 0.028, 0.025, 0.022, 0.02, 0.018, 0.016, 0.015,
  0.014, 0.013, 0.012, 0.011, 0.01,
];

/** Positions beyond 20 get this flat, conservative CTR. */
export const CTR_TAIL = 0.008;

export function ctrForPosition(position: number): number {
  if (!Number.isFinite(position) || position < 1) return 0;
  const idx = Math.floor(position) - 1;
  return CTR_BY_POSITION[idx] ?? CTR_TAIL;
}

/**
 * Estimated monthly clicks for a keyword at a given position.
 * `searchVolume` is monthly searches; `position` is the current/target average position.
 */
export function estimatedClicks(searchVolume: number, position: number): number {
  if (!Number.isFinite(searchVolume) || searchVolume <= 0) return 0;
  return Math.round(searchVolume * ctrForPosition(position));
}
