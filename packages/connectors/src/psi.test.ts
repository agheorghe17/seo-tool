import { describe, expect, it } from 'vitest';
import { fetchPageSpeed } from './psi.js';
import { fetchCrux } from './crux.js';
import { mergeCwv } from './cwv.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchPageSpeed', () => {
  it('prefers field data from loadingExperience', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        loadingExperience: {
          metrics: {
            LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2400 },
            INTERACTION_TO_NEXT_PAINT: { percentile: 180 },
            CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 8 },
          },
        },
        lighthouseResult: { audits: { 'largest-contentful-paint': { numericValue: 9999 } } },
      })) as typeof fetch;

    const m = await fetchPageSpeed('https://example.com', 'mobile', { fetchImpl });
    expect(m).toMatchObject({ lcpMs: 2400, inpMs: 180, clsScore: 0.08, source: 'field' });
  });

  it('falls back to lab data when no field data', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        lighthouseResult: {
          audits: {
            'largest-contentful-paint': { numericValue: 3100.7 },
            'cumulative-layout-shift': { numericValue: 0.12 },
            'total-blocking-time': { numericValue: 220 },
            viewport: { score: 1 },
          },
        },
      })) as typeof fetch;

    const m = await fetchPageSpeed('https://example.com', 'mobile', { fetchImpl });
    expect(m).toMatchObject({ lcpMs: 3100.7, clsScore: 0.12, mobileFriendly: true, source: 'lab' });
  });

  it('returns nulls on API error', async () => {
    const fetchImpl = (async () => jsonResponse({}, 500)) as typeof fetch;
    const m = await fetchPageSpeed('https://example.com', 'mobile', { fetchImpl });
    expect(m.source).toBe('none');
  });
});

describe('fetchCrux', () => {
  it('reads p75 field metrics', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        record: {
          metrics: {
            largest_contentful_paint: { percentiles: { p75: 2600 } },
            interaction_to_next_paint: { percentiles: { p75: 160 } },
            cumulative_layout_shift: { percentiles: { p75: '0.05' } },
          },
        },
      })) as typeof fetch;

    const m = await fetchCrux('https://example.com', { fetchImpl });
    expect(m).toEqual({ lcpMs: 2600, inpMs: 160, clsScore: 0.05, mobileFriendly: null, source: 'field' });
  });

  it('returns null when there is no field data (404)', async () => {
    const fetchImpl = (async () => jsonResponse({}, 404)) as typeof fetch;
    expect(await fetchCrux('https://example.com', { fetchImpl })).toBeNull();
  });
});

describe('mergeCwv', () => {
  it('prefers CrUX, then PSI field, then PSI lab', () => {
    const crux = { lcpMs: 2000, inpMs: null, clsScore: 0.01, mobileFriendly: null, source: 'field' as const };
    const psiM = { lcpMs: 3000, inpMs: 250, clsScore: 0.2, mobileFriendly: true, source: 'lab' as const };
    const merged = mergeCwv(crux, psiM);
    expect(merged).toMatchObject({ lcpMs: 2000, inpMs: 250, clsScore: 0.01, mobileFriendly: true, source: 'field' });
  });

  it('reports lab when nothing is field data', () => {
    const psiM = { lcpMs: 3000, inpMs: null, clsScore: null, mobileFriendly: null, source: 'lab' as const };
    expect(mergeCwv(null, psiM).source).toBe('lab');
  });
});
