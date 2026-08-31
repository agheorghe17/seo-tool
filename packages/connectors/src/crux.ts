import type { CwvMetrics } from './psi.js';

/** Epic 3.3 — Chrome UX Report API. Free, 150 req/min. Returns field (p75) data or null. */

export interface CruxOptions {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  formFactor?: 'PHONE' | 'DESKTOP' | 'TABLET';
  timeoutMs?: number;
}

const ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

interface CruxResponse {
  record?: {
    metrics?: Record<string, { percentiles?: { p75?: number | string } }>;
  };
}

function p75(record: CruxResponse['record'], key: string): number | null {
  const raw = record?.metrics?.[key]?.percentiles?.p75;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(n) ? n : null;
}

export async function fetchCrux(url: string, opts: CruxOptions = {}): Promise<CwvMetrics | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const key = opts.apiKey ? `?key=${encodeURIComponent(opts.apiKey)}` : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);

  try {
    const res = await doFetch(`${ENDPOINT}${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, formFactor: opts.formFactor }),
      signal: controller.signal,
    });
    if (res.status === 404) return null; // no field data for this URL
    if (!res.ok) return null;

    const json = (await res.json()) as CruxResponse;
    const record = json.record;
    if (!record?.metrics) return null;

    const lcp = p75(record, 'largest_contentful_paint');
    const inp = p75(record, 'interaction_to_next_paint');
    const cls = p75(record, 'cumulative_layout_shift');
    if (lcp == null && inp == null && cls == null) return null;

    return { lcpMs: lcp, inpMs: inp, clsScore: cls, mobileFriendly: null, source: 'field' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
