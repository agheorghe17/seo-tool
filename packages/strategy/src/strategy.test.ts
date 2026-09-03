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
import { planBlogArticles } from './blog-plan.js';
import { checkArticle } from './article-check.js';
import type { PageLike } from './types.js';

const fakeClicks = (v: number, pos: number) => Math.round((v * Math.max(0.01, 0.3 / pos)) * 10) / 10;

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

  it('keeps the homepage on a category term, not the highest-volume service', () => {
    const pages = [page('https://x.ro/', 'x.ro — agentie de marketing digital')];
    const kws = [
      kw('k1', 'tiktok ads', { businessRelevance: 80, searchVolume: 5000 }),
      kw('k2', 'agentie marketing digital', { businessRelevance: 85, searchVolume: 400 }),
    ];
    const res = assignPageTargets(pages, kws, { businessTerms: ['agentie', 'servicii'] });
    expect(res[0]!.targetKeywordId).toBe('k2');
  });

  it('does not assign a target below the relevance floor', () => {
    const pages = [page('https://x.ro/politica-confidentialitate', 'Politica de confidentialitate salesup')];
    const kws = [kw('k1', 'salesup', { businessRelevance: 10, searchVolume: 0 })];
    const res = assignPageTargets(pages, kws, { minRelevance: 30 });
    expect(res[0]!.targetKeyword).toBeNull();
    expect(res[0]!.targetKeywordId).toBeNull();
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

describe('planBlogArticles', () => {
  it('proposes cluster articles that link to the pillar and skips pages that exist', () => {
    const kws = [
      { id: 'p1', keyword: 'servicii google ads', clusterId: 'c1', intent: 'commercial', searchVolume: 800, businessRelevance: 90, opportunityScore: 70, hasTargetPage: true },
      { id: 'a1', keyword: 'cum functioneaza google ads', clusterId: 'c1', intent: 'informational', searchVolume: 500, businessRelevance: 75, opportunityScore: 55, hasTargetPage: false },
      { id: 'a2', keyword: 'cat costa google ads', clusterId: 'c1', intent: 'commercial', searchVolume: 300, businessRelevance: 70, opportunityScore: 50, hasTargetPage: false },
      { id: 'off', keyword: 'reteta paine', clusterId: 'c1', intent: 'informational', searchVolume: 900, businessRelevance: 5, opportunityScore: 10, hasTargetPage: false },
    ];
    const plan = planBlogArticles(
      kws,
      [{ id: 'c1', name: 'google ads' }],
      [{ clusterId: 'c1', url: 'https://x.ro/servicii-google-ads', keyword: 'servicii google ads' }],
      [{ clusterId: 'c1', count: 6 }],
      { estimatedClicks: fakeClicks },
    );
    const kwsOut = plan.articles.map((a) => a.keyword);
    expect(kwsOut).toEqual(expect.arrayContaining(['cum functioneaza google ads', 'cat costa google ads']));
    expect(kwsOut).not.toContain('servicii google ads'); // has a page
    expect(kwsOut).not.toContain('reteta paine'); // irrelevant
    expect(plan.articles[0]!.linkTo).toBe('https://x.ro/servicii-google-ads');
    expect(plan.articles[0]!.estClicks.high).toBeGreaterThan(0);
    expect(plan.totalRecommended).toBe(plan.cadence.d30 + plan.cadence.d60 + plan.cadence.d90);
  });
});

describe('checkArticle', () => {
  const good = [
    '# Cum functioneaza Google Ads',
    '',
    '## Pe scurt',
    'Google Ads afiseaza anunturi platite in cautari. Platesti pe clic si controlezi bugetul zilnic.',
    '',
    '## Ce este Google Ads',
    'Google Ads este platforma de reclame a Google. Poti targeta cuvinte cheie relevante pentru afacerea ta.',
    'Daca vrei ajutor, vezi [serviciile noastre de google ads](https://x.ro/servicii-google-ads).',
    '',
    '## Cat costa',
    'Costul depinde de competitie si de cuvintele cheie alese. Bugetul il stabilesti tu.',
    '',
    '## Cum incepi o campanie',
    'Alegi obiectivul, cuvintele cheie si scrii anunturile. Apoi optimizezi pe baza datelor.',
    '',
    '## Intrebari frecvente',
    'Cat dureaza pana vezi rezultate? De obicei cateva saptamani.',
  ].join('\n');

  it('passes a well-formed article and flags a missing internal link', () => {
    const ok = checkArticle(good, {
      keyword: 'google ads',
      linkTo: 'https://x.ro/servicii-google-ads',
      targetWords: 120,
    });
    expect(ok.checks.find((c) => c.id === 'link_pillar')!.status).toBe('pass');
    expect(ok.checks.find((c) => c.id === 'one_h1')!.status).toBe('pass');

    const noLink = checkArticle(good.replace('[serviciile noastre de google ads](https://x.ro/servicii-google-ads)', 'serviciile noastre'), {
      keyword: 'google ads',
      linkTo: 'https://x.ro/servicii-google-ads',
      targetWords: 120,
    });
    expect(noLink.checks.find((c) => c.id === 'link_pillar')!.status).toBe('fail');
    expect(noLink.pass).toBe(false);
  });

  it('fails on a position/traffic promise', () => {
    const v = checkArticle(good + '\n\nCu noi vei ajunge pe locul 1 in Google, garantat.', {
      keyword: 'google ads',
      targetWords: 120,
    });
    expect(v.checks.find((c) => c.id === 'no_promises')!.status).toBe('fail');
    expect(v.pass).toBe(false);
  });

  it('accepts a homepage link when linkTo is the site root', () => {
    const md = good.replace(
      '[serviciile noastre de google ads](https://x.ro/servicii-google-ads)',
      '[serviciile noastre de google ads](https://x.ro/)',
    );
    const v = checkArticle(md, { keyword: 'google ads', linkTo: 'https://x.ro/', targetWords: 120 });
    expect(v.checks.find((c) => c.id === 'link_pillar')!.status).toBe('pass');
  });
});
