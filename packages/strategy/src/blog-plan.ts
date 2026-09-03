import { normalize, tokens } from './text.js';

/**
 * Phase 4 — a deliberate supporting-content plan. For each topic cluster it proposes
 * blog articles that target informational long-tail, each carrying an internal link to
 * the cluster's money/pillar page. PURE + niche-agnostic.
 */

export interface BlogKeyword {
  id: string;
  keyword: string;
  clusterId: string | null;
  intent: string | null;
  searchVolume: number | null;
  businessRelevance: number | null;
  opportunityScore: number | null;
  hasTargetPage: boolean;
}

export interface BlogCluster {
  id: string;
  name: string;
}

export interface BlogPillar {
  clusterId: string | null;
  url: string;
  keyword: string | null;
}

export interface CompetitorClusterCount {
  clusterId: string | null;
  count: number;
}

export interface BlogArticleSpec {
  keywordId: string;
  keyword: string;
  secondaryKeywords: string[];
  clusterId: string | null;
  cluster: string | null;
  intent: string;
  searchVolume: number | null;
  linkTo: string | null;
  linkToLabel: string | null;
  anchor: string;
  targetWords: number;
  phase: 30 | 60 | 90;
  estClicks: { low: number; mid: number; high: number };
  why: string;
}

export interface BlogPlan {
  totalRecommended: number;
  cadence: { d30: number; d60: number; d90: number };
  articles: BlogArticleSpec[];
}

export interface BlogPlanOpts {
  /** (volume, position) -> monthly clicks. Inject from shared/ctr. */
  estimatedClicks: (volume: number, position: number) => number;
  maxTotal?: number;
  maxPerCluster?: number;
  /** URLs that already have a blueprint target — never propose an article for their keyword. */
  blueprintTargetKeywordIds?: Set<string>;
}

function volNorm(v: number | null): number {
  if (v == null || v <= 0) return 0.25;
  return Math.max(0.08, Math.min(1, Math.log10(v) / 4));
}

/** A varied, natural anchor — not exact-match on every article. */
function anchorFor(articleKw: string, pillarKw: string | null, i: number): string {
  const p = (pillarKw ?? '').trim();
  if (!p) return articleKw;
  const variants = [p, `servicii ${p}`, `mai multe despre ${p}`, p];
  return variants[i % variants.length]!;
}

export function planBlogArticles(
  keywords: BlogKeyword[],
  clusters: BlogCluster[],
  pillars: BlogPillar[],
  competitorCounts: CompetitorClusterCount[],
  opts: BlogPlanOpts,
): BlogPlan {
  const maxTotal = opts.maxTotal ?? 12;
  const maxPerCluster = opts.maxPerCluster ?? 4;
  const taken = opts.blueprintTargetKeywordIds ?? new Set<string>();

  const clusterName = new Map(clusters.map((c) => [c.id, c.name]));
  const pillarByCluster = new Map(pillars.filter((p) => p.clusterId).map((p) => [p.clusterId, p]));
  const compByCluster = new Map(competitorCounts.map((c) => [c.clusterId, c.count]));

  // Candidate article keywords: informational/commercial, relevant, no page yet, not a blueprint target.
  const ownByCluster = new Map<string | null, number>();
  for (const k of keywords) if (k.hasTargetPage) ownByCluster.set(k.clusterId, (ownByCluster.get(k.clusterId) ?? 0) + 1);

  const seen = new Set<string>();
  const candidates = keywords
    .filter((k) => {
      if (k.hasTargetPage || taken.has(k.id)) return false;
      if ((k.businessRelevance ?? 0) < 40) return false;
      const it = (k.intent ?? '').toLowerCase();
      if (it && !['informational', 'commercial', 'transactional'].includes(it)) return false;
      const norm = normalize(k.keyword);
      if (seen.has(norm) || norm.length < 4) return false;
      seen.add(norm);
      return true;
    })
    .map((k) => {
      const gap = Math.max(0, (compByCluster.get(k.clusterId) ?? 0) - (ownByCluster.get(k.clusterId) ?? 0));
      const rel = Math.max(0, Math.min(100, k.businessRelevance ?? 50)) / 100;
      const score = volNorm(k.searchVolume) * rel * (1 + Math.min(0.5, gap * 0.08));
      return { k, gap, score };
    })
    .sort((a, b) => b.score - a.score);

  // Round-robin across clusters so we don't dump everything on one topic.
  const perCluster = new Map<string | null, number>();
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= maxTotal) break;
    const n = perCluster.get(c.k.clusterId) ?? 0;
    if (n >= maxPerCluster) continue;
    perCluster.set(c.k.clusterId, n + 1);
    picked.push(c);
  }

  const articles: BlogArticleSpec[] = picked.map(({ k, gap }, i) => {
    const pillar = pillarByCluster.get(k.clusterId) ?? null;
    const it = (k.intent ?? 'informational').toLowerCase();
    const targetWords = it === 'informational' ? 1200 : 900;
    const vol = k.searchVolume ?? 0;
    // New long-tail article: realistic first-year band pos 8..15.
    const estClicks = {
      low: vol > 0 ? opts.estimatedClicks(vol, 15) : 0,
      mid: vol > 0 ? opts.estimatedClicks(vol, 11) : 0,
      high: vol > 0 ? opts.estimatedClicks(vol, 8) : 0,
    };
    // secondary = other candidate keywords in the same cluster sharing ≥1 token.
    const kToks = new Set(tokens(k.keyword));
    const secondary = picked
      .filter((p) => p.k.id !== k.id && p.k.clusterId === k.clusterId)
      .map((p) => p.k.keyword)
      .filter((kw) => tokens(kw).some((t) => kToks.has(t)))
      .slice(0, 3);
    const phase: 30 | 60 | 90 = i < Math.ceil(picked.length / 3) ? 30 : i < Math.ceil((picked.length * 2) / 3) ? 60 : 90;
    return {
      keywordId: k.id,
      keyword: k.keyword,
      secondaryKeywords: secondary,
      clusterId: k.clusterId,
      cluster: k.clusterId ? clusterName.get(k.clusterId) ?? null : null,
      intent: it,
      searchVolume: k.searchVolume,
      linkTo: pillar?.url ?? null,
      linkToLabel: pillar?.keyword ?? null,
      anchor: anchorFor(k.keyword, pillar?.keyword ?? null, i),
      targetWords,
      phase,
      estClicks,
      why:
        gap > 0
          ? `Competitorii au ~${gap} articole în plus pe „${k.clusterId ? clusterName.get(k.clusterId) ?? 'acest subiect' : 'acest subiect'}". Articolul acoperă „${k.keyword}"${
              pillar ? ` și trimite un link intern către „${pillar.keyword ?? pillar.url}".` : '.'
            }`
          : `Long-tail relevant fără pagină proprie${pillar ? `; linkează spre „${pillar.keyword ?? pillar.url}".` : '.'}`,
    };
  });

  return {
    totalRecommended: articles.length,
    cadence: {
      d30: articles.filter((a) => a.phase === 30).length,
      d60: articles.filter((a) => a.phase === 60).length,
      d90: articles.filter((a) => a.phase === 90).length,
    },
    articles,
  };
}
