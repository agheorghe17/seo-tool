import type { BusinessProfileInput } from './types.js';
import { tokens } from './text.js';

/**
 * Epic 14.3 — 0..100 relevance of a keyword to the business.
 * Overlap of keyword tokens with service/location tokens from the profile.
 * The worker can send the low-confidence middle band to an LLM for a final call.
 */
export function businessRelevance(keyword: string, profile: BusinessProfileInput): number {
  const kwToks = new Set(tokens(keyword));
  if (kwToks.size === 0) return 0;

  const serviceToks = new Set(profile.services.flatMap((s) => tokens(s)));
  const locationToks = new Set(profile.locations.flatMap((l) => tokens(l)));
  const summaryToks = new Set(tokens(profile.summary ?? ''));

  let serviceHits = 0;
  let locationHits = 0;
  let summaryHits = 0;
  for (const t of kwToks) {
    if (serviceToks.has(t)) serviceHits++;
    if (locationToks.has(t)) locationHits++;
    if (summaryToks.has(t)) summaryHits++;
  }

  // A service-token match is the strong signal; location & summary are boosters.
  const base = serviceHits / kwToks.size; // 0..1
  const score =
    base * 75 +
    Math.min(1, locationHits) * 15 +
    Math.min(1, summaryHits / Math.max(1, kwToks.size)) * 15;

  return Math.round(Math.max(0, Math.min(100, score)));
}

export function isAmbiguousRelevance(score: number): boolean {
  return score >= 25 && score <= 55;
}
