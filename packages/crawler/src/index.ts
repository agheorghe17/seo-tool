import type { PageData } from 'shared';

export * from './ssrf.js';

/**
 * Crawler package surface. Epic 2 implements these; Epic 3 adds `renderPage` (Playwright).
 * Keeping the signatures here so the worker + API can be wired against a stable contract.
 */

export interface DiscoverOptions {
  maxPages: number;
  requestsPerSecond: number;
  userAgent: string;
}

export interface DiscoveredUrl {
  url: string;
  lastmod: string | null;
  source: 'sitemap' | 'link-graph';
}

/** Epic 2.1 — parse sitemap(s) (incl. nested index) or BFS the internal link graph. */
export async function discoverUrls(
  _startUrl: string,
  _opts: DiscoverOptions,
): Promise<DiscoveredUrl[]> {
  throw new Error('not implemented — Epic 2.1');
}

/** Epic 2.3 + 2.4 — static fetch with undici, then extract with cheerio. */
export async function fetchAndExtract(_url: string, _opts: DiscoverOptions): Promise<PageData> {
  throw new Error('not implemented — Epic 2.3/2.4');
}

/** Epic 3.1 — headless render fallback for JS-heavy pages. */
export async function renderPage(_url: string): Promise<PageData> {
  throw new Error('not implemented — Epic 3.1');
}
