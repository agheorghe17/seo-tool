import { describe, expect, it } from 'vitest';
import { discoverFromSitemaps, parseSitemapXml } from './sitemap.js';

const urlset = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`;

const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
</sitemapindex>`;

describe('parseSitemapXml', () => {
  it('parses a urlset', () => {
    const parsed = parseSitemapXml(urlset);
    expect(parsed.kind).toBe('urlset');
    expect(parsed.entries).toEqual([
      { url: 'https://example.com/', lastmod: '2026-01-01' },
      { url: 'https://example.com/about', lastmod: null },
    ]);
  });

  it('detects a sitemap index', () => {
    const parsed = parseSitemapXml(index);
    expect(parsed.kind).toBe('sitemapindex');
    expect(parsed.entries.map((e) => e.url)).toEqual([
      'https://example.com/sitemap-1.xml',
      'https://example.com/sitemap-2.xml',
    ]);
  });
});

describe('discoverFromSitemaps', () => {
  it('recurses through a nested index and de-dupes', async () => {
    const pages: Record<string, string> = {
      'https://example.com/sitemap.xml': index,
      'https://example.com/sitemap-1.xml': urlset,
      'https://example.com/sitemap-2.xml': `<?xml version="1.0"?><urlset><url><loc>https://example.com/about</loc></url><url><loc>https://example.com/contact</loc></url></urlset>`,
    };
    const fakeFetch = (async (input: string | URL | Request) => {
      const body = pages[String(input)];
      return new Response(body ?? '', { status: body ? 200 : 404 });
    }) as typeof fetch;

    const entries = await discoverFromSitemaps(['https://example.com/sitemap.xml'], {
      maxUrls: 100,
      fetchImpl: fakeFetch,
    });
    expect(entries.map((e) => e.url).sort()).toEqual([
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/contact',
    ]);
  });

  it('respects maxUrls', async () => {
    const fakeFetch = (async () => new Response(urlset, { status: 200 })) as typeof fetch;
    const entries = await discoverFromSitemaps(['https://example.com/sitemap.xml'], {
      maxUrls: 1,
      fetchImpl: fakeFetch,
    });
    expect(entries).toHaveLength(1);
  });
});
