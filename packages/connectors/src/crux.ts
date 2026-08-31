import type { CwvMetrics } from './psi.js';

/** Epic 3.3 — Chrome UX Report API. Free, 150 req/min. Field data where available. */
export async function fetchCrux(_url: string): Promise<CwvMetrics | null> {
  throw new Error('not implemented — Epic 3.3');
}
