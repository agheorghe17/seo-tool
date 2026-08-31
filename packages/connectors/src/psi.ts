/** Epic 3.2 — PageSpeed Insights API. Free, 25k req/day. `PAGESPEED_API_KEY` optional but recommended. */

export interface CwvMetrics {
  lcpMs: number | null;
  inpMs: number | null;
  clsScore: number | null;
  mobileFriendly: boolean | null;
  /** 'field' = real-user CrUX data, 'lab' = Lighthouse simulation. */
  source: 'field' | 'lab' | 'none';
}

export type PsiStrategy = 'mobile' | 'desktop';

export interface PsiOptions {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  timeoutMs?: number;
}

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface PsiResponse {
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number }>;
  };
  lighthouseResult?: {
    audits?: Record<string, { numericValue?: number; score?: number | null }>;
  };
}

function fromField(metrics: Record<string, { percentile?: number }> | undefined): Partial<CwvMetrics> {
  if (!metrics) return {};
  const lcp = metrics['LARGEST_CONTENTFUL_PAINT_MS']?.percentile;
  const inp =
    metrics['INTERACTION_TO_NEXT_PAINT']?.percentile ??
    metrics['EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT']?.percentile;
  const cls = metrics['CUMULATIVE_LAYOUT_SHIFT_SCORE']?.percentile;
  return {
    lcpMs: lcp ?? null,
    inpMs: inp ?? null,
    clsScore: cls != null ? cls / 100 : null,
  };
}

function fromLab(
  audits: Record<string, { numericValue?: number; score?: number | null }> | undefined,
): Partial<CwvMetrics> {
  if (!audits) return {};
  return {
    lcpMs: audits['largest-contentful-paint']?.numericValue ?? null,
    inpMs:
      audits['interaction-to-next-paint']?.numericValue ??
      audits['experimental-interaction-to-next-paint']?.numericValue ??
      audits['total-blocking-time']?.numericValue ??
      null,
    clsScore: audits['cumulative-layout-shift']?.numericValue ?? null,
    mobileFriendly: audits['viewport'] ? audits['viewport'].score === 1 : null,
  };
}

export async function fetchPageSpeed(
  url: string,
  strategy: PsiStrategy,
  opts: PsiOptions = {},
): Promise<CwvMetrics> {
  const doFetch = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({ url, strategy, category: 'performance' });
  if (opts.apiKey) params.set('key', opts.apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await doFetch(`${ENDPOINT}?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) {
      return { lcpMs: null, inpMs: null, clsScore: null, mobileFriendly: null, source: 'none' };
    }
    const json = (await res.json()) as PsiResponse;
    const field = fromField(json.loadingExperience?.metrics);
    const lab = fromLab(json.lighthouseResult?.audits);

    const hasField = field.lcpMs != null || field.clsScore != null;
    const merged: CwvMetrics = {
      lcpMs: field.lcpMs ?? lab.lcpMs ?? null,
      inpMs: field.inpMs ?? lab.inpMs ?? null,
      clsScore: field.clsScore ?? lab.clsScore ?? null,
      mobileFriendly: lab.mobileFriendly ?? null,
      source: hasField ? 'field' : lab.lcpMs != null ? 'lab' : 'none',
    };
    return merged;
  } catch {
    return { lcpMs: null, inpMs: null, clsScore: null, mobileFriendly: null, source: 'none' };
  } finally {
    clearTimeout(timer);
  }
}
