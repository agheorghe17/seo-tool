/**
 * Epic 13.4 — pluggable SERP provider. `SERP_PROVIDER` selects one; default `none` makes
 * every SERP feature a graceful no-op. Adapters: dataforseo (implemented), serpapi /
 * scaleserp / valueserp (stubs, same contract).
 */

export interface SerpItem {
  position: number;
  domain: string;
  url: string;
  title?: string;
}

export interface SerpResult {
  keyword: string;
  gl: string;
  hl: string;
  fetchedAt: string;
  items: SerpItem[];
  /** People Also Ask + related searches — extra keyword ideas. */
  relatedQueries: string[];
}

export interface SerpQuery {
  keyword: string;
  gl?: string;
  hl?: string;
  device?: 'desktop' | 'mobile';
}

export interface SerpProvider {
  name: string;
  /** True when credentials are present and calls will actually run. */
  available(): boolean;
  search(query: SerpQuery, fetchImpl?: typeof fetch): Promise<SerpResult | null>;
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}
