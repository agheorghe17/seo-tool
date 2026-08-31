import { describe, expect, it } from 'vitest';
import type { PageData } from 'shared';
import type { RuleContext } from './rule.js';
import { scorePage } from './engine.js';

function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com/',
    statusCode: 200,
    redirectChain: [],
    indexability: 'indexable',
    renderedWith: 'static',
    contentHash: 'abc',
    title: 'A perfectly reasonable page title about widgets',
    metaDescription:
      'This is a meta description that sits comfortably within the recommended one hundred and twenty to one hundred and sixty character window for SEO.',
    h1: 'Widgets',
    headings: [{ level: 1, text: 'Widgets' }],
    wordCount: 800,
    canonicalUrl: 'https://example.com/',
    schemaTypes: ['Article'],
    images: [{ src: '/a.png', alt: 'A widget' }],
    internalLinksCount: 10,
    externalLinksCount: 2,
    lcpMs: 2000,
    inpMs: 100,
    clsScore: 0.02,
    mobileFriendly: true,
    ...overrides,
  };
}

const ctx: RuleContext = {
  siblings: [],
  site: { hasSitemap: true, https: true, robotsTxtOk: true },
};

describe('scorePage', () => {
  it('gives a clean page a perfect on-page score', () => {
    const { scores, issues } = scorePage(makePage(), ctx);
    expect(scores.onpage).toBe(100);
    expect(scores.total).toBe(100);
    expect(issues).toHaveLength(0);
  });

  it('flags a missing title and a too-long title', () => {
    const missing = scorePage(makePage({ title: null }), ctx);
    expect(missing.issues.map((i) => i.ruleId)).toContain('onpage.title-length');
    expect(missing.scores.onpage).toBeLessThan(100);

    const long = scorePage(makePage({ title: 'x'.repeat(120) }), ctx);
    expect(long.issues.find((i) => i.ruleId === 'onpage.title-length')?.detectedValue).toBe('120');
  });

  it('flags multiple H1s', () => {
    const { issues } = scorePage(
      makePage({
        headings: [
          { level: 1, text: 'One' },
          { level: 1, text: 'Two' },
        ],
      }),
      ctx,
    );
    expect(issues.find((i) => i.ruleId === 'onpage.single-h1')?.detectedValue).toBe('2');
  });

  it('flags images without alt text', () => {
    const { issues } = scorePage(
      makePage({
        images: [
          { src: '/a.png', alt: null },
          { src: '/b.png', alt: '' },
          { src: '/c.png', alt: 'ok' },
        ],
      }),
      ctx,
    );
    expect(issues.find((i) => i.ruleId === 'onpage.image-alt')?.detectedValue).toBe('2/3');
  });
});
