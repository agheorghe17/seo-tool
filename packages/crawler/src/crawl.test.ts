import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crawlSite, discoverUrls, type CrawlEvent } from './crawl.js';
import { noopRateLimiter } from './ratelimit.js';

// Fixture server hosts a small site: robots.txt, a sitemap, three pages, a redirect, a disallowed path.
let server: Server;
let origin: string;

const page = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${body} ${'w '.repeat(40)}</p></main></body></html>`;

beforeAll(async () => {
  process.env.CRAWLER_ALLOW_PRIVATE = '1';
  server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain');
      return res.end(`User-agent: *\nDisallow: /private/\nSitemap: ${origin}/sitemap.xml\n`);
    }
    if (url === '/sitemap.xml') {
      res.setHeader('content-type', 'application/xml');
      return res.end(
        `<?xml version="1.0"?><urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/about</loc></url><url><loc>${origin}/moved</loc></url><url><loc>${origin}/private/secret</loc></url></urlset>`,
      );
    }
    if (url === '/') {
      res.setHeader('content-type', 'text/html');
      return res.end(page('Home', 'welcome'));
    }
    if (url === '/about') {
      res.setHeader('content-type', 'text/html');
      return res.end(page('About', 'about us'));
    }
    if (url === '/moved') {
      res.statusCode = 301;
      res.setHeader('location', `${origin}/final`);
      return res.end();
    }
    if (url === '/final') {
      res.setHeader('content-type', 'text/html');
      return res.end(page('Final', 'after redirect'));
    }
    if (url === '/private/secret') {
      res.setHeader('content-type', 'text/html');
      return res.end(page('Secret', 'should be skipped'));
    }
    res.statusCode = 404;
    res.end('nope');
  });
  await new Promise<void>((r) => server.listen(0, r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  delete process.env.CRAWLER_ALLOW_PRIVATE;
  await new Promise<void>((r) => server.close(() => r()));
});

const opts = () => ({
  startUrl: `${origin}/`,
  maxPages: 50,
  requestsPerSecond: 0,
  userAgent: 'SeoToolBot',
  rateLimiter: noopRateLimiter,
});

describe('discoverUrls', () => {
  it('finds URLs from the sitemap', async () => {
    const { entries, source } = await discoverUrls(opts());
    expect(source).toBe('sitemap');
    expect(entries.map((e) => e.url)).toEqual(
      expect.arrayContaining([`${origin}/`, `${origin}/about`, `${origin}/moved`]),
    );
  });
});

describe('crawlSite', () => {
  it('crawls pages, follows redirects, and skips robots-disallowed URLs', async () => {
    const events: CrawlEvent[] = [];
    for await (const ev of crawlSite(opts())) events.push(ev);

    const pages = events.filter((e) => e.type === 'page');
    const skipped = events.filter((e) => e.type === 'skipped');
    const done = events.find((e) => e.type === 'done');

    const titles = pages.map((e) => (e.type === 'page' ? e.page.title : '')).sort();
    expect(titles).toEqual(['About', 'Final', 'Home']);

    const redirected = pages.find((e) => e.type === 'page' && e.page.title === 'Final');
    expect(redirected?.type === 'page' && redirected.page.redirectChain).toEqual([`${origin}/final`]);

    expect(skipped.some((e) => e.type === 'skipped' && e.reason === 'robots')).toBe(true);
    expect(done?.type === 'done' && done.status).toBe('completed');
  });

  it('emits a discovered event with the total', async () => {
    const first: CrawlEvent[] = [];
    for await (const ev of crawlSite(opts())) {
      first.push(ev);
      if (ev.type === 'discovered') break;
    }
    const discovered = first.find((e) => e.type === 'discovered');
    expect(discovered?.type === 'discovered' && discovered.total).toBe(4);
  });
});
