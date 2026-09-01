/**
 * Epic 23 — internal-linking engine. PURE. Builds the site's internal link graph and
 * produces a concrete linking plan. The killer signal: a page mentions another page's
 * target keyword several times in its body but never links to it.
 */
import { normalize, slugFromUrl, tokenSimilarity } from './text.js';

export interface LinkPage {
  url: string;
  mainText?: string | null;
  internalLinks?: { url: string; anchor: string }[];
  targetKeyword?: string | null;
  clusterId?: string | null;
  opportunityScore?: number | null;
  indexable?: boolean;
}

export interface AnchorOpportunity {
  fromUrl: string;
  toUrl: string;
  keyword: string;
  mentions: number;
  suggestedAnchor: string;
}

export interface LinkPlanItem {
  fromUrl: string;
  toUrl: string;
  anchor: string;
  reason: 'mention_no_link' | 'cluster_gap' | 'underlinked';
}

export interface InternalLinkAudit {
  orphans: string[];
  underlinked: { url: string; targetKeyword: string | null; inbound: number }[];
  anchorOpportunities: AnchorOpportunity[];
  clusterGaps: { clusterId: string; urls: string[] }[];
  plan: LinkPlanItem[];
}

function canon(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '') || u.origin;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

/** Count non-overlapping occurrences of a normalized phrase in normalized text. */
function countMentions(text: string, phrase: string): number {
  if (!phrase) return 0;
  const t = ` ${normalize(text)} `;
  const p = ` ${normalize(phrase)} `;
  if (p.trim().length < 3) return 0;
  let n = 0;
  let i = t.indexOf(p);
  while (i !== -1) {
    n++;
    i = t.indexOf(p, i + p.length - 1);
  }
  return n;
}

export function auditInternalLinks(pages: LinkPage[]): InternalLinkAudit {
  const byCanon = new Map(pages.map((p) => [canon(p.url), p]));
  const inbound = new Map<string, Set<string>>(); // toCanon -> set of fromCanon
  for (const p of pages) {
    const from = canon(p.url);
    for (const l of p.internalLinks ?? []) {
      const to = canon(l.url);
      if (to === from || !byCanon.has(to)) continue;
      const set = inbound.get(to) ?? new Set();
      set.add(from);
      inbound.set(to, set);
    }
  }

  const orphans = pages
    .filter((p) => (p.indexable ?? true) && (inbound.get(canon(p.url))?.size ?? 0) === 0 && !isHomepage(p.url))
    .map((p) => p.url);

  const underlinked = pages
    .filter(
      (p) =>
        (p.opportunityScore ?? 0) >= 40 &&
        (inbound.get(canon(p.url))?.size ?? 0) < 2 &&
        !isHomepage(p.url),
    )
    .map((p) => ({
      url: p.url,
      targetKeyword: p.targetKeyword ?? null,
      inbound: inbound.get(canon(p.url))?.size ?? 0,
    }));

  // Anchor opportunities: A mentions B.targetKeyword >= 2x in body, A has no link to B.
  const anchorOpportunities: AnchorOpportunity[] = [];
  for (const from of pages) {
    if (!from.mainText) continue;
    const fromLinks = new Set((from.internalLinks ?? []).map((l) => canon(l.url)));
    for (const to of pages) {
      if (to.url === from.url || !to.targetKeyword) continue;
      const toC = canon(to.url);
      if (fromLinks.has(toC)) continue;
      const mentions = countMentions(from.mainText, to.targetKeyword);
      if (mentions >= 2) {
        anchorOpportunities.push({
          fromUrl: from.url,
          toUrl: to.url,
          keyword: to.targetKeyword,
          mentions,
          suggestedAnchor: to.targetKeyword,
        });
      }
    }
  }
  anchorOpportunities.sort((a, b) => b.mentions - a.mentions);

  // Cluster gaps: pages sharing a cluster where fewer than half interlink.
  const clusters = new Map<string, LinkPage[]>();
  for (const p of pages) {
    if (!p.clusterId) continue;
    const arr = clusters.get(p.clusterId) ?? [];
    arr.push(p);
    clusters.set(p.clusterId, arr);
  }
  const clusterGaps: { clusterId: string; urls: string[] }[] = [];
  for (const [clusterId, members] of clusters) {
    if (members.length < 2) continue;
    let linked = 0;
    let total = 0;
    for (const a of members) {
      const aLinks = new Set((a.internalLinks ?? []).map((l) => canon(l.url)));
      for (const b of members) {
        if (a.url === b.url) continue;
        total++;
        if (aLinks.has(canon(b.url))) linked++;
      }
    }
    if (total > 0 && linked / total < 0.5) {
      clusterGaps.push({ clusterId, urls: members.map((m) => m.url) });
    }
  }

  // Plan — concrete "add link from X to Y with anchor Z", deduped, capped.
  const seen = new Set<string>();
  const plan: LinkPlanItem[] = [];
  const push = (item: LinkPlanItem) => {
    const key = `${canon(item.fromUrl)}->${canon(item.toUrl)}`;
    if (seen.has(key) || canon(item.fromUrl) === canon(item.toUrl)) return;
    seen.add(key);
    plan.push(item);
  };
  for (const o of anchorOpportunities.slice(0, 20)) {
    push({ fromUrl: o.fromUrl, toUrl: o.toUrl, anchor: o.suggestedAnchor, reason: 'mention_no_link' });
  }
  for (const g of clusterGaps) {
    for (let i = 0; i < g.urls.length - 1; i++) {
      const from = byCanon.get(canon(g.urls[i + 1]!));
      const to = byCanon.get(canon(g.urls[i]!));
      if (from && to) {
        push({
          fromUrl: from.url,
          toUrl: to.url,
          anchor: to.targetKeyword ?? slugFromUrl(to.url).replace(/[-_]+/g, ' '),
          reason: 'cluster_gap',
        });
      }
    }
  }
  for (const u of underlinked.slice(0, 8)) {
    const target = byCanon.get(canon(u.url));
    const donor = pages.find(
      (p) =>
        p.url !== u.url &&
        p.clusterId &&
        p.clusterId === target?.clusterId &&
        !(p.internalLinks ?? []).some((l) => canon(l.url) === canon(u.url)),
    );
    if (donor) {
      push({
        fromUrl: donor.url,
        toUrl: u.url,
        anchor: u.targetKeyword ?? slugFromUrl(u.url).replace(/[-_]+/g, ' '),
        reason: 'underlinked',
      });
    }
  }

  return { orphans, underlinked, anchorOpportunities: anchorOpportunities.slice(0, 30), clusterGaps, plan: plan.slice(0, 30) };
}

function isHomepage(url: string): boolean {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    return p === '' || p === '/';
  } catch {
    return false;
  }
}

/** Similarity check exported for callers that want to match a mention to a known page. */
export { tokenSimilarity };
