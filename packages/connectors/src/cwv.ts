import type { CwvMetrics } from './psi.js';

/**
 * Epic 3.5/3.6 — pick the best Core Web Vitals reading for a page.
 * Priority: CrUX field data → PSI field data → PSI lab data.
 * `mobileFriendly` only comes from PSI (lab viewport audit).
 */
export function mergeCwv(
  crux: CwvMetrics | null,
  psiMobile: CwvMetrics,
  psiDesktop?: CwvMetrics,
): CwvMetrics {
  const ordered: CwvMetrics[] = [
    ...(crux ? [crux] : []),
    ...(psiMobile.source === 'field' ? [psiMobile] : []),
    ...(psiDesktop && psiDesktop.source === 'field' ? [psiDesktop] : []),
    psiMobile,
    ...(psiDesktop ? [psiDesktop] : []),
  ];

  const pick = <K extends keyof CwvMetrics>(k: K): CwvMetrics[K] => {
    for (const m of ordered) {
      if (m[k] != null) return m[k];
    }
    return null as CwvMetrics[K];
  };

  const lcpMs = pick('lcpMs');
  const source: CwvMetrics['source'] =
    crux || psiMobile.source === 'field' || psiDesktop?.source === 'field'
      ? 'field'
      : lcpMs != null
        ? 'lab'
        : 'none';

  return {
    lcpMs,
    inpMs: pick('inpMs'),
    clsScore: pick('clsScore'),
    mobileFriendly: psiMobile.mobileFriendly ?? psiDesktop?.mobileFriendly ?? null,
    source,
  };
}
