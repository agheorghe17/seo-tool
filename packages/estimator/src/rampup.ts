/**
 * Epic 7.5 — time ramp-up. Months 1-2 see almost no movement (re-crawl / re-index lag),
 * then a gradual S-curve. Returns the fraction (0..1) of the total modelled uplift that has
 * materialised by month `m`.
 */
export function rampFraction(month: number, horizonMonths: number): number {
  if (month <= 0) return 0;
  const h = Math.max(3, Math.min(12, horizonMonths));
  // Near-zero for the first ~1.5 months, then logistic growth reaching ~1 at the horizon.
  const midpoint = h * 0.55;
  const steepness = 6 / h;
  const logistic = 1 / (1 + Math.exp(-steepness * (month - midpoint)));
  const lag = Math.max(0, Math.min(1, (month - 1.5) / 1.5)); // fade in over months 1.5..3
  return Math.max(0, Math.min(1, logistic * lag));
}

/** Hard rule (Epic 7.5): a month's midpoint must never exceed 2x the previous month's midpoint. */
export const MAX_MONTH_OVER_MONTH = 2;

export class UnrealisticGrowthError extends Error {
  constructor(month: number, ratio: number) {
    super(
      `Blocked: month ${month} projects ${ratio.toFixed(2)}x the previous month (cap ${MAX_MONTH_OVER_MONTH}x). ` +
        'Traffic estimates must not imply >2x month-over-month growth for a site without authority history.',
    );
    this.name = 'UnrealisticGrowthError';
  }
}

export function assertNoUnrealisticGrowth(monthlyMid: number[]): void {
  for (let i = 1; i < monthlyMid.length; i++) {
    const prev = monthlyMid[i - 1]!;
    const cur = monthlyMid[i]!;
    if (prev > 0 && cur / prev > MAX_MONTH_OVER_MONTH + 1e-9) {
      throw new UnrealisticGrowthError(i + 1, cur / prev);
    }
  }
}
