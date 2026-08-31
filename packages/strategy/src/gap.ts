import type { PageLike } from './types.js';
import { normalize, tokenSimilarity, tokens } from './text.js';

/**
 * Epic 16.3 — cluster-level coverage: how many pages you vs a competitor have per cluster.
 */
export interface ClusterCoverage {
  cluster: string;
  yourPages: number;
  competitorPages: number;
  gap: number; // competitor - you
}

export function clusterCoverage(
  clusters: { name: string; members: string[] }[],
  yourPages: { targetKeyword: string }[],
  competitorPages: { targetKeyword: string }[],
): ClusterCoverage[] {
  const count = (pages: { targetKeyword: string }[], members: string[]) => {
    const memberToks = members.map((m) => new Set(tokens(m)));
    return pages.filter((p) => {
      const pt = new Set(tokens(p.targetKeyword));
      return memberToks.some((mt) => {
        let inter = 0;
        for (const t of mt) if (pt.has(t)) inter++;
        return inter >= 1;
      });
    }).length;
  };

  return clusters
    .map((c) => {
      const yours = count(yourPages, c.members);
      const comp = count(competitorPages, c.members);
      return { cluster: c.name, yourPages: yours, competitorPages: comp, gap: comp - yours };
    })
    .sort((a, b) => b.gap - a.gap);
}

/**
 * Epic 16.4 — page-level content gap: subtopics the competitor's page covers that yours doesn't.
 */
export interface PageContentGap {
  wordCountDelta: number; // competitor - you
  missingHeadings: string[]; // competitor H2/H3 with no close match on your page
  missingSchema: string[];
}

export function pageContentGap(yourPage: PageLike | null, competitorPage: PageLike): PageContentGap {
  const yourHeads = (yourPage?.headings ?? [])
    .filter((h) => h.level >= 2 && h.level <= 3)
    .map((h) => normalize(h.text));
  const compHeads = competitorPage.headings.filter((h) => h.level >= 2 && h.level <= 3);

  const missingHeadings = compHeads
    .filter((h) => {
      const t = normalize(h.text);
      return t.length > 3 && !yourHeads.some((yh) => tokenSimilarity(yh, t) >= 0.5);
    })
    .map((h) => h.text.trim())
    .slice(0, 12);

  const yourSchema = new Set(yourPage?.schemaTypes ?? []);
  const missingSchema = competitorPage.schemaTypes.filter((s) => !yourSchema.has(s));

  return {
    wordCountDelta: competitorPage.wordCount - (yourPage?.wordCount ?? 0),
    missingHeadings,
    missingSchema,
  };
}
