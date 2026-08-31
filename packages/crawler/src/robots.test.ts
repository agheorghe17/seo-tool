import { describe, expect, it } from 'vitest';
import { parseRobots } from './robots.js';

const UA = 'SeoToolBot';

describe('parseRobots', () => {
  const body = [
    'User-agent: *',
    'Disallow: /admin/',
    'Crawl-delay: 3',
    '',
    'User-agent: BadBot',
    'Disallow: /',
    '',
    'Sitemap: https://example.com/sitemap.xml',
    'Sitemap: https://example.com/news-sitemap.xml',
  ].join('\n');

  const rules = parseRobots('https://example.com/robots.txt', body, UA);

  it('applies disallow rules for our UA', () => {
    expect(rules.isAllowed('https://example.com/blog/post')).toBe(true);
    expect(rules.isAllowed('https://example.com/admin/settings')).toBe(false);
  });

  it('reads crawl-delay and sitemaps', () => {
    expect(rules.crawlDelaySeconds).toBe(3);
    expect(rules.sitemaps).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/news-sitemap.xml',
    ]);
  });

  it('defaults to allowed when robots is empty', () => {
    const empty = parseRobots('https://example.com/robots.txt', '', UA);
    expect(empty.isAllowed('https://example.com/anything')).toBe(true);
  });
});
