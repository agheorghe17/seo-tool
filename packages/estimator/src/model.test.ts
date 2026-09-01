import { describe, expect, it } from 'vitest';
import { estimateTraffic } from './model.js';
import { assertNoUnrealisticGrowth, rampFraction, UnrealisticGrowthError } from './rampup.js';
import { totalUpliftFraction } from './impact.js';

const baseInput = {
  baselineMonthlyVisits: 1000,
  baselineSource: 'gsc' as const,
  openIssuesByCategory: { technical: 4, onpage: 6, content: 3 },
  siteScore: 55,
  horizonMonths: 6,
  gscConnected: true,
};

describe('estimateTraffic — always an interval', () => {
  it('returns low <= mid <= high plus assumptions and a monthly series', () => {
    const e = estimateTraffic(baseInput);
    expect(e.estimateLow).toBeLessThanOrEqual(e.estimateMid);
    expect(e.estimateMid).toBeLessThanOrEqual(e.estimateHigh);
    expect(e.assumptions.length).toBeGreaterThanOrEqual(5);
    expect(e.series).toHaveLength(6);
    // No key that looks like a single guaranteed number.
    expect(Object.keys(e)).not.toContain('estimate');
    expect(Object.keys(e)).not.toContain('guaranteed');
  });

  it('never projects more than ~2x baseline at the horizon, and less without GSC', () => {
    const manyIssues = {
      ...baseInput,
      openIssuesByCategory: { technical: 50, onpage: 50, content: 50, cwv: 50, geo: 50 },
      siteScore: 5,
    };
    const huge = estimateTraffic(manyIssues);
    expect(huge.estimateHigh).toBeLessThanOrEqual(baseInput.baselineMonthlyVisits * 2);

    const noGsc = estimateTraffic({
      ...manyIssues,
      baselineSource: 'keyword_model',
      gscConnected: false,
    });
    expect(noGsc.estimateHigh).toBeLessThanOrEqual(baseInput.baselineMonthlyVisits * 1.6);
    expect(noGsc.confidenceLevel).toBe('low');
  });

  it('months 1-2 show almost no movement', () => {
    const e = estimateTraffic(baseInput);
    expect(e.series[0]!.mid / baseInput.baselineMonthlyVisits).toBeLessThan(1.05);
    expect(e.series[1]!.mid).toBeLessThanOrEqual(e.series[5]!.mid);
  });

  it('clamps the horizon to 3..12', () => {
    expect(estimateTraffic({ ...baseInput, horizonMonths: 1 }).horizonMonths).toBe(3);
    expect(estimateTraffic({ ...baseInput, horizonMonths: 99 }).horizonMonths).toBe(12);
  });

  it('with no open issues, the interval collapses toward the baseline', () => {
    const e = estimateTraffic({ ...baseInput, openIssuesByCategory: {} });
    expect(e.estimateMid).toBe(baseInput.baselineMonthlyVisits);
  });

  it('exposes 30/60/90/180-day phase bands that never break the 2x MoM rule', () => {
    const e = estimateTraffic(baseInput);
    expect(e.phases.map((p) => p.days)).toEqual([30, 60, 90, 180]);
    for (const p of e.phases) {
      expect(p.low).toBeLessThanOrEqual(p.mid);
      expect(p.mid).toBeLessThanOrEqual(p.high);
    }
    // monotonic non-decreasing across phases
    for (let i = 1; i < e.phases.length; i++) {
      expect(e.phases[i]!.mid).toBeGreaterThanOrEqual(e.phases[i - 1]!.mid);
    }
  });

  it('bottom-up pageUpliftClicks can only tighten the estimate, never inflate it', () => {
    const withoutBu = estimateTraffic(baseInput);
    const withBu = estimateTraffic({
      ...baseInput,
      pageUpliftClicks: { low: 10, mid: 30, high: 60 },
    });
    expect(withBu.estimateHigh).toBeLessThanOrEqual(withoutBu.estimateHigh);
    expect(withBu.estimateLow).toBeLessThanOrEqual(withBu.estimateMid);
    expect(withBu.estimateMid).toBeLessThanOrEqual(withBu.estimateHigh);
  });

  it('ignores a zero/empty bottom-up signal (qualitative — no volume data)', () => {
    const a = estimateTraffic(baseInput);
    const b = estimateTraffic({ ...baseInput, pageUpliftClicks: { low: 0, mid: 0, high: 0 } });
    expect(b.estimateHigh).toBe(a.estimateHigh);
  });
});

describe('assertNoUnrealisticGrowth', () => {
  it('throws on a >2x month-over-month jump', () => {
    expect(() => assertNoUnrealisticGrowth([100, 100, 300])).toThrow(UnrealisticGrowthError);
  });
  it('passes a gradual series', () => {
    expect(() => assertNoUnrealisticGrowth([100, 110, 130, 160])).not.toThrow();
  });
});

describe('rampFraction', () => {
  it('is ~0 early and approaches 1 by the horizon', () => {
    expect(rampFraction(1, 6)).toBeLessThan(0.05);
    expect(rampFraction(6, 6)).toBeGreaterThan(0.6);
  });
});

describe('totalUpliftFraction', () => {
  it('saturates and stays conservative', () => {
    const a = totalUpliftFraction({ content: 4 });
    const b = totalUpliftFraction({ content: 40 });
    expect(b.high).toBeGreaterThan(a.high);
    expect(b.high).toBeLessThan(0.2); // single category stays small
    expect(a.low).toBe(0);
  });
});
