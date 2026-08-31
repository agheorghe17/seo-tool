/**
 * Epic 7.3.1 — DataForSEO. FEATURE-FLAGGED and OFF by default (`FEATURE_DATAFORSEO=off`).
 * Never call these unless the flag is explicitly `on` — it breaks the "cost 0" constraint.
 */

export function dataForSeoEnabled(): boolean {
  return process.env.FEATURE_DATAFORSEO === 'on';
}

export interface KeywordRow {
  keyword: string;
  searchVolume: number;
  difficulty: number;
}

export async function fetchKeywordData(_keywords: string[]): Promise<KeywordRow[]> {
  if (!dataForSeoEnabled()) {
    throw new Error('DataForSEO is disabled (FEATURE_DATAFORSEO != on)');
  }
  throw new Error('not implemented — Epic 7.3.1');
}
