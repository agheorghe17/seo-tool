import { extractInternalLinks, extractPage, looksJsHeavy } from './extract.js';
import { fetchStatic, type FetchOptions } from './fetch.js';
import { loadRobots, type RobotsRules } from './robots.js';
import { discoverFromSitemaps, type SitemapEntry } from './sitemap.js';
import { noopRateLimiter, TokenBucketRateLimiter, type RateLimiter } from './ratelimit.js';
import { isSafeCrawlUrl } from './ssrf.js';
import type { PageData } from 'shared';

export interface CrawlOptions {
  startUrl: string;
  maxPages: number;
  requestsPerSecond: number;
  userAgent: string;
  concurrency?: number;
  rateLimiter?: RateLimiter;
  fetchImpl?: typeof fetch;
  fetchOptions?: Partial<FetchOptions>;
}

export type CrawlEvent =
  | { type: 'discovered'; total: number; source: 'sitemap' | 'link-graph' }
  | { type: 'page'; page: PageData; jsHeavy: boolean; scanned: number; total: number }
  | { type: 'error'; url: string; reason: string; scanned: number; total: number }
  | { type: 'skipped'; url: string; reason: 'robots' | 'unsafe'; scanned: number; total: number }
  | { type: 'done'; scanned: number; total: number; status: 'completed' | 'partial' };

export interface DiscoverResult {
  entries: SitemapEntry[];
  source: 'sitemap' | 'link-graph';
}

async function bfsDiscover(
  startUrl: string,
  robots: RobotsRules,
  opts: CrawlOptions,
): Promise<SitemapEntry[]> {
  const fetchOpts: FetchOptions = { userAgent: opts.userAgent, ...opts.fetchOptions };
  const limiter = opts.rateLimiter ?? new TokenBucketRateLimiter(opts.requestsPerSecond);
  const origin = new URL(startUrl).origin;
  const seen = new Set<string>();
  const queue: string[] = [startUrl];
  const found: SitemapEntry[] = [];

  while (queue.length > 0 && found.length < opts.maxPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!robots.isAllowed(url) || !isSafeCrawlUrl(url)) continue;

    await limiter.take(origin);
    try {
      const res = await fetchStatic(url, fetchOpts);
      found.push({ url: res.finalUrl, lastmod: null });
      if (res.isHtml) {
        for (const link of extractInternalLinks(res.body, res.finalUrl)) {
          if (!seen.has(link) && queue.length + found.length < opts.maxPages * 2) queue.push(link);
        }
      }
    } catch {
      /* skip unreachable */
    }
  }
  return found;
}

/** Epic 2.1 — discover the URL set: sitemaps first, BFS link-graph as a fallback. */
export async function discoverUrls(opts: CrawlOptions): Promise<DiscoverResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const origin = new URL(opts.startUrl).origin;
  const robots = await loadRobots(origin, opts.userAgent, fetchImpl);

  const sitemapCandidates = [
    ...robots.sitemaps,
    new URL('/sitemap.xml', origin).toString(),
    new URL('/sitemap_index.xml', origin).toString(),
  ];
  const fromSitemaps = await discoverFromSitemaps(sitemapCandidates, {
    maxUrls: opts.maxPages,
    fetchImpl,
  });
  // SSRF filter only here; robots disallow is enforced per-URL in crawlSite so skips stay observable.
  const safe = fromSitemaps.filter((e) => isSafeCrawlUrl(e.url));
  if (safe.length > 0) return { entries: safe.slice(0, opts.maxPages), source: 'sitemap' };

  const bfs = await bfsDiscover(opts.startUrl, robots, opts);
  return { entries: bfs.slice(0, opts.maxPages), source: 'link-graph' };
}

/**
 * Epic 2 — crawl a site, yielding progress events. The consumer (worker `crawl` job)
 * persists pages, updates `crawls.pages_scanned`, and enqueues `render` for JS-heavy pages.
 */
export async function* crawlSite(opts: CrawlOptions): AsyncGenerator<CrawlEvent> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const origin = new URL(opts.startUrl).origin;
  const robots = await loadRobots(origin, opts.userAgent, fetchImpl);
  const limiter =
    opts.rateLimiter ??
    (opts.requestsPerSecond > 0
      ? new TokenBucketRateLimiter(opts.requestsPerSecond)
      : noopRateLimiter);
  const fetchOpts: FetchOptions = { userAgent: opts.userAgent, ...opts.fetchOptions };

  const { entries, source } = await discoverUrls(opts);
  const total = entries.length;
  yield { type: 'discovered', total, source };

  let scanned = 0;
  let hadError = false;
  const concurrency = Math.max(1, opts.concurrency ?? 5);
  const queue = [...entries];

  const results: CrawlEvent[] = [];
  async function worker(): Promise<void> {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;

      if (!isSafeCrawlUrl(entry.url)) {
        scanned++;
        results.push({ type: 'skipped', url: entry.url, reason: 'unsafe', scanned, total });
        continue;
      }
      if (!robots.isAllowed(entry.url)) {
        scanned++;
        results.push({ type: 'skipped', url: entry.url, reason: 'robots', scanned, total });
        continue;
      }

      await limiter.take(origin);
      try {
        const res = await fetchStatic(entry.url, fetchOpts);
        scanned++;
        if (!res.isHtml) {
          results.push({
            type: 'error',
            url: entry.url,
            reason: `non-HTML response (${res.statusCode})`,
            scanned,
            total,
          });
          hadError = true;
          continue;
        }
        const page = extractPage({
          finalUrl: res.finalUrl,
          statusCode: res.statusCode,
          redirectChain: res.redirectChain,
          html: res.body,
          headers: res.headers,
        });
        results.push({
          type: 'page',
          page,
          jsHeavy: looksJsHeavy(page, res.body),
          scanned,
          total,
        });
      } catch (err) {
        scanned++;
        hadError = true;
        results.push({ type: 'error', url: entry.url, reason: String(err), scanned, total });
      }
    }
  }

  // Run the pool, but yield events as they land by draining `results` between ticks.
  const pool = Array.from({ length: concurrency }, () => worker());
  let done = false;
  void Promise.all(pool).then(() => {
    done = true;
  });

  while (!done || results.length > 0) {
    if (results.length === 0) {
      await new Promise((r) => setTimeout(r, 5));
      continue;
    }
    yield results.shift()!;
  }

  yield {
    type: 'done',
    scanned,
    total,
    status: hadError && scanned < total ? 'partial' : hadError ? 'partial' : 'completed',
  };
}
