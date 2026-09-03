import { describe, expect, it } from 'vitest';
import type { PageData } from 'shared';
import type { RuleContext } from './rule.js';
import { scorePage, scoreSite } from './engine.js';
import { loadWeights } from './weights.js';

function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com/widgets',
    statusCode: 200,
    redirectChain: [],
    indexability: 'indexable',
    renderedWith: 'static',
    contentHash: 'abc',
    title: 'A perfectly reasonable page title about widgets',
    metaDescription:
      'This is a meta description that sits comfortably within the recommended one hundred and twenty to one hundred and sixty character window for SEO.',
    h1: 'Widgets',
    headings: [
      { level: 1, text: 'Widgets' },
      { level: 2, text: 'Pe scurt' },
      { level: 2, text: 'Blue widgets' },
      { level: 2, text: 'Red widgets' },
    ],
    wordCount: 800,
    canonicalUrl: 'https://example.com/widgets',
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

const ctx = (siblings: PageData[] = []): RuleContext => ({
  siblings,
  site: { hasSitemap: true, https: true, robotsTxtOk: true },
});

describe('scorePage — clean page', () => {
  it('scores 100 across the board with no issues', () => {
    const { scores, issues } = scorePage(makePage(), ctx());
    expect(issues).toHaveLength(0);
    expect(scores).toMatchObject({
      technical: 100,
      cwv: 100,
      onpage: 100,
      content: 100,
      geo: 100,
      total: 100,
    });
  });
});

describe('scorePage — technical', () => {
  it('flags non-200 status as critical', () => {
    const { scores, issues } = scorePage(makePage({ statusCode: 404 }), ctx());
    expect(issues.find((i) => i.ruleId === 'technical.status-ok')?.severity).toBe('critical');
    expect(scores.technical).toBeLessThan(50);
  });

  it('flags http (no HTTPS)', () => {
    const { issues } = scorePage(makePage({ url: 'http://example.com/widgets' }), ctx());
    expect(issues.some((i) => i.ruleId === 'technical.https')).toBe(true);
  });

  it('flags redirect chains and noindex', () => {
    const chain = scorePage(makePage({ redirectChain: ['a', 'b', 'c'] }), ctx());
    expect(chain.issues.some((i) => i.ruleId === 'technical.redirect-chain')).toBe(true);
    const noindex = scorePage(makePage({ indexability: 'noindex' }), ctx());
    expect(noindex.issues.some((i) => i.ruleId === 'technical.indexable')).toBe(true);
  });

  it('detects duplicate content across siblings', () => {
    const a = makePage({ url: 'https://example.com/a', contentHash: 'same', wordCount: 400 });
    const b = makePage({ url: 'https://example.com/b', contentHash: 'same', wordCount: 400 });
    const { issues } = scorePage(a, ctx([a, b]));
    expect(issues.find((i) => i.ruleId === 'technical.duplicate-content')?.detectedValue).toBe(
      'https://example.com/b',
    );
  });
});

describe('scorePage — CWV', () => {
  it('flags poor LCP/INP/CLS but ignores null metrics', () => {
    const bad = scorePage(makePage({ lcpMs: 4200, inpMs: 350, clsScore: 0.3 }), ctx());
    expect(bad.issues.map((i) => i.ruleId)).toEqual(
      expect.arrayContaining(['cwv.lcp', 'cwv.inp', 'cwv.cls']),
    );
    const unknown = scorePage(
      makePage({ lcpMs: null, inpMs: null, clsScore: null, mobileFriendly: null }),
      ctx(),
    );
    expect(unknown.issues.some((i) => i.category === 'cwv')).toBe(false);
  });
});

describe('scorePage — content & geo', () => {
  it('flags thin content', () => {
    const { issues } = scorePage(makePage({ wordCount: 80 }), ctx());
    expect(issues.find((i) => i.ruleId === 'content.thin')?.detectedValue).toBe('80');
  });

  it('flags missing schema and non-scannable long content', () => {
    const { issues } = scorePage(
      makePage({ schemaTypes: [], headings: [{ level: 1, text: 'X' }], wordCount: 900 }),
      ctx(),
    );
    expect(issues.map((i) => i.ruleId)).toEqual(
      expect.arrayContaining(['geo.schema-present', 'geo.answerable-schema', 'geo.scannable']),
    );
  });

  it('flags question headings that are not marked up as FAQ (geo.answer-ready)', () => {
    const { issues } = scorePage(
      makePage({
        schemaTypes: ['Article'],
        headings: [
          { level: 1, text: 'Ghid' },
          { level: 2, text: 'Cât costă un site?' },
          { level: 2, text: 'Cum aleg agenția?' },
        ],
      }),
      ctx(),
    );
    expect(issues.find((i) => i.ruleId === 'geo.answer-ready')?.detectedValue).toBe('2');
  });

  it('passes geo.answer-ready when FAQPage schema is present', () => {
    const { issues } = scorePage(
      makePage({
        schemaTypes: ['FAQPage'],
        headings: [
          { level: 1, text: 'Ghid' },
          { level: 2, text: 'Cât costă?' },
          { level: 2, text: 'Cum aleg?' },
        ],
      }),
      ctx(),
    );
    expect(issues.find((i) => i.ruleId === 'geo.answer-ready')).toBeUndefined();
  });

  it('flags a long page without a "Pe scurt" summary (geo.tldr)', () => {
    const { issues } = scorePage(
      makePage({ wordCount: 1200, headings: [{ level: 1, text: 'T' }, { level: 2, text: 'Detalii' }] }),
      ctx(),
    );
    expect(issues.some((i) => i.ruleId === 'geo.tldr')).toBe(true);
  });

  it('flags a contact page missing LocalBusiness schema (onpage.localbusiness-schema)', () => {
    const { issues } = scorePage(
      makePage({ url: 'https://example.com/contact', schemaTypes: ['Article'] }),
      ctx(),
    );
    expect(issues.some((i) => i.ruleId === 'onpage.localbusiness-schema')).toBe(true);
  });

  it('passes onpage.localbusiness-schema on a normal page', () => {
    const { issues } = scorePage(makePage({ url: 'https://example.com/blog/post' }), ctx());
    expect(issues.some((i) => i.ruleId === 'onpage.localbusiness-schema')).toBe(false);
  });

  it('skips onpage.localbusiness-schema for a national site (market.localSeo = false)', () => {
    const { issues } = scorePage(
      makePage({ url: 'https://example.com/contact', schemaTypes: ['Article'] }),
      { ...ctx(), market: { localSeo: false } },
    );
    expect(issues.some((i) => i.ruleId === 'onpage.localbusiness-schema')).toBe(false);
  });

  it('keeps onpage.localbusiness-schema for a local site (market.localSeo = true)', () => {
    const { issues } = scorePage(
      makePage({ url: 'https://example.com/contact', schemaTypes: ['Article'] }),
      { ...ctx(), market: { localSeo: true } },
    );
    expect(issues.some((i) => i.ruleId === 'onpage.localbusiness-schema')).toBe(true);
  });
});

describe('scoreSite', () => {
  it('penalises missing HTTPS and sitemap', () => {
    const res = scoreSite([90, 80, 70], { https: false, hasSitemap: false, robotsTxtOk: true });
    expect(res.penalty).toBe(23);
    expect(res.score).toBe(80 - 23);
    expect(res.issues.map((i) => i.ruleId)).toEqual(['site.https', 'site.sitemap']);
  });

  it('is clean when all facts are ok', () => {
    const res = scoreSite([100, 100], { https: true, hasSitemap: true, robotsTxtOk: true });
    expect(res).toMatchObject({ penalty: 0, score: 100, issues: [] });
  });
});

describe('loadWeights', () => {
  it('merges partial overrides onto defaults', () => {
    expect(loadWeights({ geo: 0.2 })).toMatchObject({ geo: 0.2, technical: 0.3 });
  });
  it('falls back to defaults on invalid input', () => {
    expect(loadWeights({ geo: 5 }).geo).toBe(0.1);
    expect(loadWeights('nonsense').technical).toBe(0.3);
  });
});
