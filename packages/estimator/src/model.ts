import type { ConfidenceLevel, ScoreCategory } from 'shared';
import { totalUpliftFraction } from './impact.js';
import { assertNoUnrealisticGrowth, MAX_MONTH_OVER_MONTH, rampFraction } from './rampup.js';

export interface EstimateInput {
  baselineMonthlyVisits: number;
  baselineSource: 'gsc' | 'keyword_model';
  /** Count of currently-failing issues per category (the headroom that could be fixed). */
  openIssuesByCategory: Partial<Record<ScoreCategory, number>>;
  /** Current site score 0-100 — less headroom the higher it is. */
  siteScore: number;
  /** 3-12; clamped. */
  horizonMonths?: number;
  gscConnected: boolean;
  /**
   * Epic 22 — bottom-up extra monthly clicks from per-page blueprint potentials, as an
   * interval. When provided (and > 0) it pulls the projection toward a data-grounded
   * number; it can only make the estimate MORE conservative, never inflate it.
   */
  pageUpliftClicks?: { low: number; mid: number; high: number };
  /**
   * Phase 4 — extra monthly clicks from the supporting blog-article plan (new pages for
   * keywords with no page yet). Absolute clicks, an interval. Added on top of
   * `pageUpliftClicks` for the bottom-up total; both are still ramped and capped.
   */
  contentUpliftClicks?: { low: number; mid: number; high: number };
  /**
   * Phase 4 — bounded multiplier for internal-link equity flowing to the pillar pages
   * from supporting articles. Caller computes `1 + min(0.05 * nArticles, 0.25)`; clamped
   * to 1.0..1.25 here. Applied to the bottom-up uplift only.
   */
  internalLinkBoost?: number;
  /**
   * Epic 23 — per-category multiplier learned from this site's own intervention outcomes
   * (`impact_calibration`). Bounded 0.5..1.5 by the caller. Scales that category's uplift.
   */
  categoryCalibration?: Partial<Record<ScoreCategory, number>>;
}

export interface MonthPoint {
  month: number;
  low: number;
  mid: number;
  high: number;
}

export interface PhasePoint {
  days: number; // 30 | 60 | 90 | 180
  low: number;
  mid: number;
  high: number;
}

export interface TrafficEstimateResult {
  baselineMonthlyVisits: number;
  baselineSource: 'gsc' | 'keyword_model';
  horizonMonths: number;
  /** Interval at the horizon. NEVER a single guaranteed figure. */
  estimateLow: number;
  estimateMid: number;
  estimateHigh: number;
  /** Monthly band for charting (Epic 8.7). */
  series: MonthPoint[];
  /** Epic 22 — 30/60/90/180-day bands derived from `series`. Still an interval. */
  phases: PhasePoint[];
  confidenceLevel: ConfidenceLevel;
  assumptions: string[];
}

export interface Backtest {
  projectedLow: number;
  projectedHigh: number;
  actual: number;
  withinBand: boolean;
  agoDays: number;
}

/**
 * Epic 23 — how a previous estimate's projection for "now" compares to reality.
 * Interpolates the previous monthly series to the elapsed time and checks the band.
 */
export function backtestEstimate(
  prevSeries: MonthPoint[],
  agoDays: number,
  actualMonthlyClicks: number,
): Backtest | null {
  if (prevSeries.length === 0 || agoDays < 20) return null;
  const monthPos = Math.max(1, agoDays / 30);
  const i = Math.min(prevSeries.length - 1, Math.floor(monthPos) - 1);
  const j = Math.min(prevSeries.length - 1, i + 1);
  const frac = Math.min(1, Math.max(0, monthPos - Math.floor(monthPos)));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * frac);
  const low = lerp(prevSeries[i]!.low, prevSeries[j]!.low);
  const high = lerp(prevSeries[i]!.high, prevSeries[j]!.high);
  const actual = Math.max(0, Math.round(actualMonthlyClicks));
  return {
    projectedLow: low,
    projectedHigh: high,
    actual,
    withinBand: actual >= low && actual <= high,
    agoDays: Math.round(agoDays),
  };
}

/** Pick the 30/60/90/180-day bands out of a monthly series (1 month ≈ 30 days). */
export function phasesFromSeries(series: MonthPoint[]): PhasePoint[] {
  const at = (monthIdx: number): MonthPoint | undefined => series[monthIdx] ?? series[series.length - 1];
  return [30, 60, 90, 180]
    .map((days) => {
      const p = at(days / 30 - 1);
      return p ? { days, low: p.low, mid: p.mid, high: p.high } : null;
    })
    .filter((p): p is PhasePoint => p !== null);
}

const BASE_ASSUMPTIONS = [
  'Presupunem că site-ul menține publicarea de conținut la ritmul actual.',
  'Presupunem zero backlink-uri noi obținute în perioadă.',
  'Presupunem că algoritmii Google rămân relativ stabili (fără update major advers).',
  'Presupunem re-crawl și re-indexare completă în 4-12 săptămâni de la aplicarea fix-urilor.',
  'Cifrele sunt un interval de scenarii, nu o promisiune. Rezultatele reale pot fi în afara intervalului.',
];

function headroomFactor(siteScore: number): number {
  // A site at 90/100 has little room to grow from fixes; one at 40/100 has lots.
  const s = Math.max(0, Math.min(100, siteScore));
  return Math.max(0.15, (100 - s) / 100);
}

/**
 * Epic 7 — produce a traffic estimate as an INTERVAL with explicit assumptions.
 * There is intentionally no code path that returns a single "guaranteed" number.
 */
export function estimateTraffic(input: EstimateInput): TrafficEstimateResult {
  const horizonMonths = Math.max(3, Math.min(12, Math.round(input.horizonMonths ?? 6)));
  const baseline = Math.max(0, Math.round(input.baselineMonthlyVisits));

  // Epic 23 — scale each category's open-issue count by the site's learned multiplier.
  const cal = input.categoryCalibration;
  const calibratedIssues = cal
    ? (Object.fromEntries(
        Object.entries(input.openIssuesByCategory).map(([c, n]) => [
          c,
          (n ?? 0) * Math.max(0.5, Math.min(1.5, cal[c as ScoreCategory] ?? 1)),
        ]),
      ) as typeof input.openIssuesByCategory)
    : input.openIssuesByCategory;

  const uplift = totalUpliftFraction(calibratedIssues);
  const hr = headroomFactor(input.siteScore);

  // Scale by headroom; keyword-model baselines are shakier, so trim the optimistic side.
  const sourcePenalty = input.baselineSource === 'gsc' ? 1 : 0.7;
  let fracLow = uplift.low * hr * sourcePenalty;
  let fracMid = uplift.mid * hr * sourcePenalty;
  let fracHigh = uplift.high * hr * sourcePenalty;

  // Absolute conservative caps on total uplift over the whole horizon.
  const highCap = input.gscConnected ? 1.0 : 0.6; // +100% / +60%
  fracHigh = Math.min(fracHigh, highCap);
  fracMid = Math.min(fracMid, fracHigh);
  fracLow = Math.min(fracLow, fracMid);

  // Bottom-up absolute clicks: blueprint fixes + supporting blog articles, with a bounded
  // internal-link boost applied to the whole bottom-up sum.
  const boost = Math.max(1, Math.min(1.25, input.internalLinkBoost ?? 1));
  const sum = (a?: { low: number; mid: number; high: number }, b?: typeof a) => ({
    low: Math.max(0, (a?.low ?? 0) + (b?.low ?? 0)) * boost,
    mid: Math.max(0, (a?.mid ?? 0) + (b?.mid ?? 0)) * boost,
    high: Math.max(0, (a?.high ?? 0) + (b?.high ?? 0)) * boost,
  });
  const buClicks = sum(input.pageUpliftClicks, input.contentUpliftClicks);
  const hasBottomUp = buClicks.low > 0 || buClicks.mid > 0 || buClicks.high > 0;

  const series: MonthPoint[] = [];
  const contentAssumption: string[] = [];

  if (hasBottomUp && baseline < 20) {
    // Near-zero current organic traffic → percentage growth is meaningless. Project in
    // ABSOLUTE terms from the summed per-page/per-article potential. Still ramped, still
    // capped at 2x month-over-month.
    for (let m = 1; m <= horizonMonths; m++) {
      const r = rampFraction(m, horizonMonths);
      series.push({
        month: m,
        low: Math.round(baseline + buClicks.low * r),
        mid: Math.round(baseline + buClicks.mid * r),
        high: Math.round(baseline + buClicks.high * r),
      });
    }
    contentAssumption.push(
      'Trafic organic curent aproape zero — proiecția e suma potențialului paginilor și articolelor din plan (dacă ajung pe pozițiile țintă), nu o creștere procentuală.',
    );
  } else {
    // Normal mode — blend the bottom-up fraction into the top-down cap (tighten only).
    if (hasBottomUp && baseline > 0) {
      const f = (c: number) => Math.max(0, c) / baseline;
      fracHigh = Math.min(fracHigh, Math.max(f(buClicks.high), fracMid));
      fracMid = Math.min(fracHigh, (fracMid + f(buClicks.mid)) / 2);
      fracLow = Math.min(fracMid, Math.max(0, (fracLow + f(buClicks.low)) / 2));
    }
    for (let m = 1; m <= horizonMonths; m++) {
      const r = rampFraction(m, horizonMonths);
      series.push({
        month: m,
        low: Math.round(baseline * (1 + fracLow * r)),
        mid: Math.round(baseline * (1 + fracMid * r)),
        high: Math.round(baseline * (1 + fracHigh * r)),
      });
    }
  }

  // Clamp any month to at most 2x the previous month's midpoint (keeps the hard rule safe
  // even in absolute mode when going from a tiny number to a small one).
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!;
    const cur = series[i]!;
    if (prev.mid > 0 && cur.mid / prev.mid > MAX_MONTH_OVER_MONTH) {
      const k = (MAX_MONTH_OVER_MONTH * prev.mid) / cur.mid;
      cur.low = Math.round(cur.low * k);
      cur.mid = Math.round(cur.mid * k);
      cur.high = Math.round(cur.high * k);
    }
  }

  // Epic 7.5 hard rule — refuse to emit a series implying >2x month-over-month growth.
  assertNoUnrealisticGrowth(series.map((p) => p.mid));

  if (boost > 1) {
    contentAssumption.push(
      `Articolele de suport trimit linkuri interne către paginile-bani → +${Math.round((boost - 1) * 100)}% estimat pe upliftul acelor pagini (efect modest, plafonat).`,
    );
  }

  const last = series[series.length - 1]!;
  const confidenceLevel: ConfidenceLevel =
    input.baselineSource === 'gsc' && baseline > 0 ? 'medium' : 'low';

  return {
    baselineMonthlyVisits: baseline,
    baselineSource: input.baselineSource,
    horizonMonths,
    estimateLow: last.low,
    estimateMid: last.mid,
    estimateHigh: last.high,
    series,
    phases: phasesFromSeries(series),
    confidenceLevel,
    assumptions: [
      input.baselineSource === 'gsc'
        ? 'Baseline din date reale Google Search Console (ultimele luni).'
        : 'Baseline estimat din volume de căutare × CTR pe poziție (fără GSC conectat — încredere scăzută).',
      `Orizont de proiecție: ${horizonMonths} luni.`,
      ...contentAssumption,
      ...BASE_ASSUMPTIONS,
    ],
  };
}
