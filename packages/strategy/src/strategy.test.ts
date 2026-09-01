import { describe, expect, it } from 'vitest';
import { classifyIntent } from './intent.js';
import { businessRelevance } from './relevance.js';
import { clusterKeywords } from './cluster.js';
import { cannibalization, strikingDistance } from './striking.js';
import { guessTargetKeyword } from './target-keyword.js';
import { pageContentGap } from './gap.js';
import { prioritiseOpportunities, scoreOpportunity } from './opportunity.js';
import { assignPageTargets, type KeywordCandidate } from './page-target.js';
import { detectDecay } from './decay.js';
import { auditInternalLinks } from './internal-links.js';
import { resolveCannibalization } from './cannibalization.js';
import { recommendArchitecture } from './architecture.js';
import type { PageLike } from './types.js';

describe('classifyIntent', () => {
  it('maps common Romanian modifiers', () => {
    expect(classifyIntent('preț creare magazin online')).toBe('transactional');
    expect(classifyIntent('agentie google ads bucuresti')).toBe('local');
    expect(classifyIntent('cele mai bune agentii ppc')).toBe('commercial');
    expect(classifyIntent('cum functioneaza google ads')).toBe('informational');
    expect(classifyIntent('creare site web')).toBe('commercial');
  });
});

describe('businessRelevance', () => {
  const profile = {
    summary: 'Agentie de marketing digital din Romania.',
    services: ['Google Ads', 'Facebook Ads', 'creare site-uri web', 'magazine online'],
    locations: ['Romania', 'Bucuresti'],
  };
  it('scores on-topic keywords high and off-topic low', () => {
    expect(businessRelevance('servicii google ads bucuresti', profile)).toBeGreaterThan(50);
    expect(businessRelevance('reteta paine de casa', profile)).toBeLessThan(20);
  });
});

describe('clusterKeywords', () => {
  it('groups by shared significant tokens', () => {
    const clusters = clusterKeywords([
      { keyword: 'google ads agentie' },
      { keyword: 'campanii google ads' },
      { keyword: 'pret google ads' },
      { keyword: 'creare magazin online' },
      { keyword: 'magazin online woocommerce' },
    ]);
    const ads = clusters.find((c) => c.members.includes('google ads agentie'));
    expect(ads?.members).toEqual(expect.arrayContaining(['campanii google ads', 'pret google ads']));
    expect(ads?.members).not.toContain('creare magazin online');
  });
});

describe('strikingDistance & cannibalization', () => {
  const rows = [
    { keyword: 'agentie ppc', page: '/ppc', position: 12.3, impressions: 400, clicks: 5 },
    { keyword: 'agentie ppc', page: '/servicii', position: 18.1, impressions: 120, clicks: 1 },
    { keyword: 'google ads', page: '/google-ads', position: 2.1, impressions: 900, clicks: 90 },
    { keyword: 'tiktok ads', page: '/tiktok', position: 34, impressions: 60, clicks: 0 },
  ];
  it('finds page-2 keywords with impressions', () => {
    const s = strikingDistance(rows);
    expect(s.map((x) => x.keyword)).toContain('agentie ppc');
    expect(s.map((x) => x.keyword)).not.toContain('google ads'); // already #2
    expect(s.map((x) => x.keyword)).not.toContain('tiktok ads'); // pos 34
  });
  it('flags a query split across pages', () => {
    const c = cannibalization(rows);
    expect(c[0]?.keyword).toBe('agentie ppc');
    expect(c[0]?.pages).toHaveLength(2);
  });
});

describe('guessTargetKeyword', () => {
  it('pulls the keyword from title/slug/h1', () => {
    const g = guessTargetKeyword({
      url: 'https://x.ro/servicii/google-ads',
      title: 'Servicii Google Ads | Agentie X',
      h1: 'Servicii Google Ads pentru afacerea ta',
      headings: [],
      wordCount: 800,
      schemaTypes: [],
    });
    expect(g.keyword).toContain('google ads');
    expect(g.confidence).toBeGreaterThan(0.3);
  });
});

describe('pageContentGap', () => {
  it('lists competitor headings you are missing', () => {
    const gap = pageContentGap(
      {
        url: 'a',
        title: 'Google Ads',
        h1: 'Google Ads',
        headings: [{ level: 2, text: 'Ce sunt campaniile Google Ads' }],
        wordCount: 500,
        schemaTypes: [],
      },
      {
        url: 'b',
        title: 'Google Ads',
        h1: 'Google Ads',
        headings: [
          { level: 2, text: 'Ce sunt campaniile Google Ads' },
          { level: 2, text: 'Cat costa o campanie Google Ads' },
          { level: 2, text: 'Studii de caz' },
        ],
        wordCount: 1800,
        schemaTypes: ['FAQPage'],
      },
    );
    expect(gap.wordCountDelta).toBe(1300);
    expect(gap.missingHeadings).toEqual(
      expect.arrayContaining(['Cat costa o campanie Google Ads', 'Studii de caz']),
    );
    expect(gap.missingSchema).toContain('FAQPage');
  });
});

describe('opportunity', () => {
  it('buckets a striking-distance, low-competition keyword as quick_win', () => {
    const r = scoreOpportunity({
      keyword: 'agentie google ads cluj',
      searchVolume: 320,
      competition: 0.3,
      currentPosition: 12,
      businessRelevance: 80,
      hasTargetPage: true,
    });
    expect(r.bucket).toBe('quick_win');
    expect(r.score).toBeGreaterThan(0);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it('buckets a no-page keyword with volume as build_content and sorts by score', () => {
    const list = prioritiseOpportunities([
      { keyword: 'a', searchVolume: 10, businessRelevance: 20 },
      { keyword: 'b', searchVolume: 900, businessRelevance: 70, hasTargetPage: false, competition: 0.4 },
    ]);
    expect(list[0]!.keyword).toBe('b');
    expect(list[0]!.bucket).toBe('build_content');
  });
  it('never returns a position or guaranteed-traffic promise', () => {
    const r = scoreOpportunity({ keyword: 'x', searchVolume: 500, businessRelevance: 60 });
    const text = JSON.stringify(r).toLowerCase();
    expect(text).not.toMatch(/locul 1|pozitia 1 garantat|garantat/);
  });
});

describe('assignPageTargets', () => {
  const page = (url: string, title: string, wordCount = 500): PageLike => ({
    url,
    title,
    h1: title,
    headings: [],
    wordCount,
    schemaTypes: [],
  });
  const kw = (id: string, keyword: string, extra: Partial<KeywordCandidate> = {}): KeywordCandidate => ({
    id,
    keyword,
    businessRelevance: 70,
    opportunityScore: 50,
    searchVolume: 300,
    ...extra,
  });

  it('gives the homepage the head term and matches service pages to their keyword', () => {
    const pages = [
      page('https://x.ro/', 'x.ro — agentie de marketing'),
      page('https://x.ro/google-ads', 'Servicii Google Ads'),
      page('https://x.ro/facebook-ads', 'Servicii Facebook Ads'),
    ];
    const kws = [
      kw('k1', 'agentie de marketing', { businessRelevance: 90, searchVolume: 900 }),
      kw('k2', 'servicii google ads'),
      kw('k3', 'servicii facebook ads'),
    ];
    const res = assignPageTargets(pages, kws);
    const home = res.find((r) => r.isHomepage)!;
    expect(home.targetKeywordId).toBe('k1');
    expect(res.find((r) => r.url.endsWith('/google-ads'))!.targetKeywordId).toBe('k2');
    expect(res.find((r) => r.url.endsWith('/facebook-ads'))!.targetKeywordId).toBe('k3');
  });

  it('flags cannibalisation when two pages target near-identical keywords', () => {
    const pages = [
      page('https://x.ro/ppc', 'Servicii PPC Google Ads'),
      page('https://x.ro/google-ads', 'Servicii Google Ads PPC'),
    ];
    const kws = [kw('k1', 'servicii google ads ppc'), kw('k2', 'servicii ppc google ads')];
    const res = assignPageTargets(pages, kws);
    expect(res.some((r) => r.diagnosis === 'cannibalization')).toBe(true);
  });

  it('flags an orphan page with content but no matching keyword', () => {
    const pages = [page('https://x.ro/random-legacy-thing', 'Complet fara legatura', 400)];
    const kws = [kw('k1', 'servicii google ads')];
    const res = assignPageTargets(pages, kws);
    expect(res[0]!.diagnosis).toBe('orphan_page');
  });

  it('prefers the local head term for the homepage when localEmphasis + primaryCity', () => {
    const pages = [page('https://x.ro/', 'x.ro')];
    const kws = [
      kw('k1', 'agentie de marketing', { businessRelevance: 90, searchVolume: 1000 }),
      kw('k2', 'agentie de marketing cluj', { businessRelevance: 88, searchVolume: 200 }),
    ];
    const res = assignPageTargets(pages, kws, { primaryCity: 'Cluj', localEmphasis: true });
    expect(res[0]!.targetKeywordId).toBe('k2');
  });
});

describe('detectDecay', () => {
  it('flags a page with 3+ months of clicks decline from its peak', () => {
    const h = [
      { url: 'https://x.ro/ghid', month: '2026-01', clicks: 100, impressions: 2000, position: 4 },
      { url: 'https://x.ro/ghid', month: '2026-02', clicks: 90, impressions: 1900, position: 5 },
      { url: 'https://x.ro/ghid', month: '2026-03', clicks: 60, impressions: 1800, position: 8 },
      { url: 'https://x.ro/ghid', month: '2026-04', clicks: 40, impressions: 1700, position: 11 },
      { url: 'https://x.ro/ghid', month: '2026-05', clicks: 25, impressions: 1600, position: 14 },
    ];
    const [d] = detectDecay(h);
    expect(d!.url).toBe('https://x.ro/ghid');
    expect(d!.monthsDeclining).toBeGreaterThanOrEqual(3);
    expect(d!.clicksDropPct).toBeGreaterThan(0.5);
  });

  it('does not flag a stable/growing page', () => {
    const h = [
      { url: 'https://x.ro/ok', month: '2026-01', clicks: 20, impressions: 400, position: 6 },
      { url: 'https://x.ro/ok', month: '2026-02', clicks: 24, impressions: 450, position: 6 },
      { url: 'https://x.ro/ok', month: '2026-03', clicks: 22, impressions: 460, position: 6 },
      { url: 'https://x.ro/ok', month: '2026-04', clicks: 30, impressions: 500, position: 5 },
    ];
    expect(detectDecay(h)).toHaveLength(0);
  });
});

describe('auditInternalLinks', () => {
  it('finds a mention-without-link anchor opportunity and an orphan', () => {
    const pages = [
      {
        url: 'https://x.ro/blog/despre-google-ads',
        mainText:
          'servicii google ads sunt utile. cu servicii google ads poti creste. servicii google ads bune costa.',
        internalLinks: [{ url: 'https://x.ro/blog/', anchor: 'blog' }],
        clusterId: 'c1',
      },
      {
        url: 'https://x.ro/servicii/google-ads',
        mainText: 'pagina de serviciu',
        internalLinks: [],
        targetKeyword: 'servicii google ads',
        clusterId: 'c1',
        opportunityScore: 70,
      },
    ];
    const a = auditInternalLinks(pages);
    expect(a.anchorOpportunities.some((o) => o.toUrl.endsWith('/servicii/google-ads'))).toBe(true);
    expect(a.orphans).toContain('https://x.ro/servicii/google-ads');
    expect(a.plan.length).toBeGreaterThan(0);
  });
});

describe('resolveCannibalization', () => {
  it('picks the best-positioned page as canonical and 301s the rest', () => {
    const group = [
      { url: 'https://x.ro/ppc', title: 'PPC', h1: 'PPC', headings: [{ level: 2, text: 'Preturi' }], wordCount: 500, schemaTypes: [], currentPosition: 18 },
      { url: 'https://x.ro/google-ads', title: 'Google Ads', h1: 'Google Ads', headings: [], wordCount: 900, schemaTypes: [], currentPosition: 7 },
    ];
    const plan = resolveCannibalization(group, 'servicii google ads')!;
    expect(plan.canonicalUrl).toBe('https://x.ro/google-ads');
    expect(plan.redirects).toEqual([{ from: 'https://x.ro/ppc', to: 'https://x.ro/google-ads' }]);
    expect(plan.mergeInstructions.length).toBeGreaterThan(0);
  });
});

describe('recommendArchitecture', () => {
  it('separates pillars, supporting and orphan clusters', () => {
    const clusters = [
      { id: 'big', name: 'google ads', members: ['a', 'b', 'c', 'd', 'e'] },
      { id: 'small', name: 'tiktok ads', members: ['x', 'y'] },
      { id: 'orphan', name: 'linkedin ads', members: ['p', 'q', 'r'] },
    ];
    const assignments = [
      { url: 'https://x.ro/google-ads', targetKeyword: 'a', clusterId: 'big' },
      { url: 'https://x.ro/tiktok', targetKeyword: 'x', clusterId: 'small' },
    ];
    const plan = recommendArchitecture(clusters, assignments);
    expect(plan.pillars.map((p) => p.clusterId)).toEqual(['big']);
    expect(plan.orphanClusters.map((o) => o.clusterId)).toContain('orphan');
    expect(plan.coverage).toEqual({ pillarsNeeded: 1, pillarsHave: 1 });
  });
});
