export * from './ssrf.js';
export * from './robots.js';
export * from './sitemap.js';
export * from './fetch.js';
export * from './extract.js';
export * from './ratelimit.js';
export * from './crawl.js';

import type { PageData } from 'shared';
import { fetchStatic } from './fetch.js';
import { extractPage } from './extract.js';

/** Convenience: fetch one URL statically and extract it. Epic 3 adds a Playwright variant. */
export async function fetchAndExtract(url: string, userAgent: string): Promise<PageData> {
  const res = await fetchStatic(url, { userAgent });
  if (!res.isHtml) {
    throw new Error(`non-HTML response for ${url} (${res.statusCode})`);
  }
  return extractPage({
    finalUrl: res.finalUrl,
    statusCode: res.statusCode,
    redirectChain: res.redirectChain,
    html: res.body,
    headers: res.headers,
  });
}

/** Epic 3.1 — headless render fallback for JS-heavy pages. */
export async function renderPage(_url: string): Promise<PageData> {
  throw new Error('not implemented — Epic 3.1');
}
