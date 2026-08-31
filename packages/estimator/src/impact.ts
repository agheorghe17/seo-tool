import type { ScoreCategory } from 'shared';

/**
 * Epic 7.4 — conservative per-category uplift *intervals* applied when open issues in a
 * category are resolved. These are deliberately small. They are NOT predictions; they feed
 * a range, never a single number.
 *
 * Interpretation: if a category has open issues, resolving them *could* contribute an uplift
 * somewhere between `low` and `high` (as a fraction of baseline), scaled by how many issues
 * are open vs. a saturation count. `mid` is the working midpoint.
 *
 * Sources to cite in Epic 7 sign-off: published ranking-factor correlation studies
 * (Ahrefs / Semrush) — correlation, not causation, hence the wide, low ranges.
 */
export const CATEGORY_UPLIFT: Record<ScoreCategory, { low: number; mid: number; high: number }> = {
  technical: { low: 0.0, mid: 0.04, high: 0.1 },
  cwv: { low: 0.0, mid: 0.02, high: 0.06 },
  onpage: { low: 0.0, mid: 0.05, high: 0.12 },
  content: { low: 0.0, mid: 0.06, high: 0.16 },
  geo: { low: 0.0, mid: 0.02, high: 0.05 },
};

/** Issues beyond this count in a category don't add more modelled uplift (diminishing returns). */
export const SATURATION_ISSUES = 8;

export interface UpliftFractions {
  low: number;
  mid: number;
  high: number;
}

/** Total uplift fraction (over baseline) if ALL currently-open issues were fixed and fully indexed. */
export function totalUpliftFraction(
  openIssuesByCategory: Partial<Record<ScoreCategory, number>>,
): UpliftFractions {
  let low = 0;
  let mid = 0;
  let high = 0;
  for (const [cat, count] of Object.entries(openIssuesByCategory) as [ScoreCategory, number][]) {
    if (!count || count <= 0) continue;
    const weight = Math.min(1, count / SATURATION_ISSUES);
    const band = CATEGORY_UPLIFT[cat];
    if (!band) continue;
    low += band.low * weight;
    mid += band.mid * weight;
    high += band.high * weight;
  }
  return { low, mid, high };
}
