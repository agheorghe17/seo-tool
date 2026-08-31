import { describe, expect, it } from 'vitest';
import { classifyIntent } from './intent.js';
import { businessRelevance } from './relevance.js';
import { clusterKeywords } from './cluster.js';
import { cannibalization, strikingDistance } from './striking.js';
import { guessTargetKeyword } from './target-keyword.js';
import { pageContentGap } from './gap.js';
import { prioritiseOpportunities, scoreOpportunity } from './opportunity.js';

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
