import type { KeywordBucket, KeywordInput } from './types.js';

/**
 * Epic 17.1 — opportunity scoring + bucketing. PURE. Intentionally produces a 0..100 score,
 * NOT a promised position or traffic number.
 *
 *   score = volume_norm(0..1) * relevance(0..1) * achievability(0..1) * page_factor
 * where achievability rewards low competition and being already close (striking distance).
 */
export interface OpportunityResult {
  keyword: string;
  score: number; // 0..100
  bucket: KeywordBucket;
  reasons: string[];
}

function volumeNorm(v: number | null | undefined): number {
  if (!v || v <= 0) return 0.05;
  // log scale: 10 -> ~0.15, 100 -> ~0.4, 1000 -> ~0.7, 10000+ -> ~1
  return Math.max(0.05, Math.min(1, Math.log10(v) / 4));
}

function achievability(kw: KeywordInput): number {
  const comp = kw.competition ?? 0.5; // 0 easy .. 1 hard
  let a = 1 - comp * 0.7; // competition drags it down but never to zero
  const pos = kw.currentPosition;
  if (pos != null) {
    if (pos <= 3) a *= 0.4; // already there — little upside
    else if (pos <= 10) a *= 1.1;
    else if (pos <= 20) a *= 1.25; // striking distance — most achievable
    else a *= 0.9;
  }
  return Math.max(0.05, Math.min(1, a));
}

export function scoreOpportunity(kw: KeywordInput): OpportunityResult {
  const vol = volumeNorm(kw.searchVolume);
  const rel = Math.max(0, Math.min(100, kw.businessRelevance ?? 50)) / 100;
  const ach = achievability(kw);
  const pageFactor = kw.hasTargetPage ? 1 : 0.7;

  const score = Math.round(vol * rel * ach * pageFactor * 100);

  const reasons: string[] = [];
  if ((kw.searchVolume ?? 0) >= 200) reasons.push(`volum de căutare bun (~${kw.searchVolume}/lună)`);
  if (rel >= 0.6) reasons.push('foarte relevant pentru serviciile tale');
  if (kw.currentPosition != null && kw.currentPosition > 3 && kw.currentPosition <= 20)
    reasons.push(`ești deja pe poziția ${Math.round(kw.currentPosition)} — aproape de prima pagină`);
  if ((kw.competition ?? 0.5) <= 0.35) reasons.push('competiție scăzută');
  if (!kw.hasTargetPage) reasons.push('nu ai încă o pagină dedicată — oportunitate de conținut nou');

  let bucket: KeywordBucket = 'none';
  const pos = kw.currentPosition;
  if (pos != null && pos > 3 && pos <= 20 && (kw.competition ?? 1) <= 0.6 && rel >= 0.4) {
    bucket = 'quick_win';
  } else if (!kw.hasTargetPage && (kw.searchVolume ?? 0) >= 50 && rel >= 0.4) {
    bucket = 'build_content';
  } else if (score >= 20) {
    bucket = 'long_game';
  }

  return { keyword: kw.keyword, score, bucket, reasons };
}

export function prioritiseOpportunities(keywords: KeywordInput[]): OpportunityResult[] {
  return keywords
    .map(scoreOpportunity)
    .sort((a, b) => b.score - a.score);
}
