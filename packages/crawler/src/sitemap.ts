import * as cheerio from 'cheerio';

/** Epic 2.1.1 — parse sitemap.xml, following nested <sitemapindex> recursively. */

export interface SitemapEntry {
  url: string;
  lastmod: string | null;
}

export interface DiscoverSitemapOptions {
  maxUrls: number;
  fetchImpl?: typeof fetch;
  /** Guard against sitemap loops / bombs. */
  maxSitemaps?: number;
}

interface ParsedSitemap {
  kind: 'urlset' | 'sitemapindex';
  entries: SitemapEntry[];
}

export function parseSitemapXml(xml: string): ParsedSitemap {
  const $ = cheerio.load(xml, { xmlMode: true });

  if ($('sitemapindex').length > 0) {
    const entries: SitemapEntry[] = [];
    $('sitemap').each((_, el) => {
      const loc = $(el).find('loc').first().text().trim();
      const lastmod = $(el).find('lastmod').first().text().trim() || null;
      if (loc) entries.push({ url: loc, lastmod });
    });
    return { kind: 'sitemapindex', entries };
  }

  const entries: SitemapEntry[] = [];
  $('url').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    const lastmod = $(el).find('lastmod').first().text().trim() || null;
    if (loc) entries.push({ url: loc, lastmod });
  });
  return { kind: 'urlset', entries };
}

/**
 * Discover page URLs starting from one or more sitemap URLs.
 * Returns de-duplicated entries, capped at `maxUrls`.
 */
export async function discoverFromSitemaps(
  sitemapUrls: string[],
  opts: DiscoverSitemapOptions,
): Promise<SitemapEntry[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxSitemaps = opts.maxSitemaps ?? 50;
  const seenSitemaps = new Set<string>();
  const queue = [...sitemapUrls];
  const out = new Map<string, SitemapEntry>();

  while (queue.length > 0 && seenSitemaps.size < maxSitemaps && out.size < opts.maxUrls) {
    const current = queue.shift()!;
    if (seenSitemaps.has(current)) continue;
    seenSitemaps.add(current);

    let xml: string;
    try {
      const res = await fetchImpl(current, { redirect: 'follow' });
      if (!res.ok) continue;
      xml = await res.text();
    } catch {
      continue;
    }

    const parsed = parseSitemapXml(xml);
    if (parsed.kind === 'sitemapindex') {
      for (const entry of parsed.entries) {
        if (!seenSitemaps.has(entry.url)) queue.push(entry.url);
      }
    } else {
      for (const entry of parsed.entries) {
        if (out.size >= opts.maxUrls) break;
        if (!out.has(entry.url)) out.set(entry.url, entry);
      }
    }
  }

  return [...out.values()];
}
