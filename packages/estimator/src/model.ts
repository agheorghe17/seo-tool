import type { ConfidenceLevel, ScoreCategory } from 'shared';
import { totalUpliftFraction } from './impact.js';
import { assertNoUnrealisticGrowth, rampFraction } from './rampup.js';

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

  const uplift = totalUpliftFraction(input.openIssuesByCategory);
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

  // Epic 22 — blend in bottom-up per-page potential. It can only tighten the estimate.
  const bu = input.pageUpliftClicks;
  if (bu && baseline > 0 && (bu.low > 0 || bu.mid > 0 || bu.high > 0)) {
    const f = (c: number) => Math.max(0, c) / baseline;
    const buLow = f(bu.low);
    const buMid = f(bu.mid);
    const buHigh = f(bu.high);
    // High: don't exceed the top-down cap, but let the data-grounded number pull it down
    // toward mid (never below the top-down mid).
    fracHigh = Math.min(fracHigh, Math.max(buHigh, fracMid));
    fracMid = Math.min(fracHigh, (fracMid + buMid) / 2);
    fracLow = Math.min(fracMid, Math.max(0, (fracLow + buLow) / 2));
  }

  const series: MonthPoint[] = [];
  for (let m = 1; m <= horizonMonths; m++) {
    const r = rampFraction(m, horizonMonths);
    series.push({
      month: m,
      low: Math.round(baseline * (1 + fracLow * r)),
      mid: Math.round(baseline * (1 + fracMid * r)),
      high: Math.round(baseline * (1 + fracHigh * r)),
    });
  }

  // Epic 7.5 hard rule — refuse to emit a series implying >2x month-over-month growth.
  assertNoUnrealisticGrowth(series.map((p) => p.mid));

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
      ...BASE_ASSUMPTIONS,
    ],
  };
}
