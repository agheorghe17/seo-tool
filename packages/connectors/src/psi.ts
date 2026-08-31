/** Epic 3.2 — PageSpeed Insights API. Free, 25k req/day. `PAGESPEED_API_KEY`. */

export interface CwvMetrics {
  lcpMs: number | null;
  inpMs: number | null;
  clsScore: number | null;
  mobileFriendly: boolean | null;
  source: 'field' | 'lab';
}

export type PsiStrategy = 'mobile' | 'desktop';

export async function fetchPageSpeed(_url: string, _strategy: PsiStrategy): Promise<CwvMetrics> {
  throw new Error('not implemented — Epic 3.2');
}
