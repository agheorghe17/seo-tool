import type { KeywordInput, PageLike } from './types.js';
import { normalize, slugFromUrl, tokenSimilarity, tokens } from './text.js';

/**
 * Epic 22 — assign each of the site's own pages the keyword it should own, and flag
 * structural problems (cannibalisation, orphan pages, pages with no clear target).
 *
 * PURE + niche-agnostic: the only market input is `opts` (primary city + local emphasis),
 * which the caller reads from the per-site business profile. No hardcoded country/city/niche.
 */

export interface KeywordCandidate extends KeywordInput {
  id: string;
  opportunityScore?: number | null;
}

export type PageDiagnosis = 'ok' | 'cannibalization' | 'orphan_page' | 'no_target';

export interface PageTargetAssignment {
  url: string;
  isHomepage: boolean;
  targetKeywordId: string | null;
  targetKeyword: string | null;
  secondaryKeywordIds: string[];
  diagnosis: PageDiagnosis;
  /** Other own URLs competing for the same/near keyword (when diagnosis = cannibalization). */
  competingUrls: string[];
  /** 0..1 — how well the target keyword matches the page's title/H1/slug. */
  fit: number;
}

export interface AssignOpts {
  primaryCity?: string | null;
  localEmphasis?: boolean;
  homepageUrl?: string;
  /**
   * Generic "what this business is" words (e.g. "agentie", "servicii", plus the
   * core nouns from the profile summary). When set, the homepage is matched to a
   * *category* term that contains one of these — not the single highest-volume
   * service keyword.
   */
  businessTerms?: string[];
  /** A (page, keyword) pair below this business-relevance is not an eligible target. */
  minRelevance?: number;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    return url;
  }
}

function isHomepage(url: string, homepageUrl?: string): boolean {
  if (homepageUrl && url === homepageUrl) return true;
  const p = pathOf(url);
  return p === '' || p === '/';
}

function pageHaystack(p: PageLike): string {
  return normalize(`${p.title ?? ''} ${p.h1 ?? ''} ${(p.slug ?? slugFromUrl(p.url)).replace(/[-_]+/g, ' ')}`);
}

function volumeNorm(v: number | null | undefined): number {
  if (v == null) return 0.4;
  if (v <= 0) return 0.08;
  return Math.max(0.08, Math.min(1, Math.log10(v) / 4));
}

/** Fit + relevance + opportunity → a single 0..1 score for a (page, keyword) pair. */
function pairScore(fit: number, kw: KeywordCandidate): number {
  const rel = Math.max(0, Math.min(100, kw.businessRelevance ?? 50)) / 100;
  const opp = Math.max(0, Math.min(100, kw.opportunityScore ?? 30)) / 100;
  return fit * (0.5 + 0.5 * rel) * (0.4 + 0.6 * opp);
}

export function assignPageTargets(
  pages: PageLike[],
  keywords: KeywordCandidate[],
  opts: AssignOpts = {},
): PageTargetAssignment[] {
  const city = opts.primaryCity ? normalize(opts.primaryCity) : null;
  const cityToks = city ? new Set(tokens(city)) : new Set<string>();

  // Precompute fit(page, keyword) for every pair.
  const hay = new Map(pages.map((p) => [p.url, pageHaystack(p)]));
  const fitOf = (url: string, kw: string) => tokenSimilarity(kw, hay.get(url) ?? '');

  const floor = opts.minRelevance ?? 0;
  const pairs: { url: string; kwId: string; kw: string; fit: number; score: number }[] = [];
  for (const p of pages) {
    for (const k of keywords) {
      if ((k.businessRelevance ?? 50) < floor) continue;
      const fit = fitOf(p.url, k.keyword);
      if (fit <= 0) continue;
      pairs.push({ url: p.url, kwId: k.id, kw: k.keyword, fit, score: pairScore(fit, k) });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const targetByUrl = new Map<string, { kwId: string; kw: string; fit: number }>();
  const claimedKw = new Set<string>();

  // 1) Greedy 1:1 best matches.
  for (const pr of pairs) {
    if (targetByUrl.has(pr.url) || claimedKw.has(pr.kwId)) continue;
    targetByUrl.set(pr.url, { kwId: pr.kwId, kw: pr.kw, fit: pr.fit });
    claimedKw.add(pr.kwId);
  }

  // 2) Homepage owns the head term (highest relevance × volume), local variant if configured.
  const homeUrl = pages.find((p) => isHomepage(p.url, opts.homepageUrl))?.url;
  if (homeUrl) {
    const bizToks = new Set((opts.businessTerms ?? []).flatMap((t) => tokens(t)));
    const rankBy = (k: KeywordCandidate) =>
      ((k.businessRelevance ?? 0) / 100) * volumeNorm(k.searchVolume);
    // Prefer *category* terms — a keyword that carries one of the business words
    // (e.g. "agentie marketing") over a single high-volume service ("tiktok ads").
    const categoryPool = bizToks.size
      ? keywords.filter((k) => {
          if ((k.businessRelevance ?? 0) < Math.max(floor, 40)) return false;
          const kt = new Set(tokens(k.keyword));
          for (const t of bizToks) if (kt.has(t)) return true;
          return false;
        })
      : [];
    const pool = categoryPool.length ? categoryPool : keywords;
    const ranked = [...pool].sort((a, b) => rankBy(b) - rankBy(a));
    const localHead =
      opts.localEmphasis && cityToks.size
        ? ranked.find((k) => {
            const kt = new Set(tokens(k.keyword));
            for (const t of cityToks) if (kt.has(t)) return true;
            return false;
          })
        : undefined;
    const head = localHead ?? ranked[0];
    if (head) {
      const prev = targetByUrl.get(homeUrl);
      if (prev && prev.kwId !== head.id) claimedKw.delete(prev.kwId);
      claimedKw.delete(head.id);
      targetByUrl.set(homeUrl, { kwId: head.id, kw: head.keyword, fit: fitOf(homeUrl, head.keyword) });
      claimedKw.add(head.id);
      // If another page had claimed the head term, it will be re-flagged below.
      for (const [u, t] of targetByUrl) {
        if (u !== homeUrl && t.kwId === head.id) targetByUrl.delete(u);
      }
    }
  }

  // 3) Diagnose each page.
  const out: PageTargetAssignment[] = [];
  for (const p of pages) {
    const home = isHomepage(p.url, opts.homepageUrl);
    const t = targetByUrl.get(p.url);
    const myPairs = pairs.filter((pr) => pr.url === p.url).sort((a, b) => b.fit - a.fit);
    const bestFit = myPairs[0]?.fit ?? 0;

    let diagnosis: PageDiagnosis = 'ok';
    const competingUrls: string[] = [];

    if (!t) {
      diagnosis = bestFit < 0.15 && p.wordCount > 120 ? 'orphan_page' : 'no_target';
    } else {
      // Cannibalisation: another page's target keyword is near-identical, or this page's
      // strong second choice is exactly another page's target.
      for (const [otherUrl, other] of targetByUrl) {
        if (otherUrl === p.url) continue;
        const sim = tokenSimilarity(t.kw, other.kw);
        const wantsOthersKw = myPairs.some((pr) => pr.kwId === other.kwId && pr.fit >= t.fit - 0.1 && pr.fit >= 0.35);
        if (sim >= 0.7 || wantsOthersKw) competingUrls.push(otherUrl);
      }
      if (competingUrls.length) diagnosis = 'cannibalization';
    }

    const secondary = myPairs
      .filter((pr) => pr.kwId !== t?.kwId && pr.fit >= 0.3)
      .slice(0, 3)
      .map((pr) => pr.kwId);

    out.push({
      url: p.url,
      isHomepage: home,
      targetKeywordId: t?.kwId ?? null,
      // No fabricated fallback — a page with no eligible match has no target.
      targetKeyword: t?.kw ?? null,
      secondaryKeywordIds: secondary,
      diagnosis,
      competingUrls,
      fit: t?.fit ?? bestFit,
    });
  }

  // Homepage first, then problems, then by fit.
  const rank = (d: PageDiagnosis) =>
    d === 'no_target' ? 0 : d === 'cannibalization' ? 1 : d === 'orphan_page' ? 2 : 3;
  return out.sort((a, b) => {
    if (a.isHomepage !== b.isHomepage) return a.isHomepage ? -1 : 1;
    if (rank(a.diagnosis) !== rank(b.diagnosis)) return rank(a.diagnosis) - rank(b.diagnosis);
    return b.fit - a.fit;
  });
}
