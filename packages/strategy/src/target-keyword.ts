import type { PageLike } from './types.js';
import { normalize, slugFromUrl, tokens } from './text.js';

/**
 * Epic 16.2 — guess the primary keyword a page targets, from title + slug + H1.
 * Deterministic; the worker can send low-confidence guesses to an LLM.
 */
export function guessTargetKeyword(page: PageLike): { keyword: string; confidence: number } {
  const title = normalize(page.title ?? '');
  const h1 = normalize(page.h1 ?? '');
  const slug = normalize((page.slug ?? slugFromUrl(page.url)).replace(/[-_]+/g, ' '));

  const candidates = new Map<string, number>();
  const add = (phrase: string, weight: number) => {
    const p = phrase.trim();
    if (p.split(' ').length >= 2 && p.length <= 60) {
      candidates.set(p, (candidates.get(p) ?? 0) + weight);
    }
  };

  // Title: strip brand tail after a separator.
  const titleCore = title.split(/[|\-–—:·]/)[0]?.trim() ?? title;
  add(titleCore, 3);
  add(h1, 2.5);
  add(slug, 2);

  // n-grams (2..4 words) from title+h1 that also appear in the slug get a boost.
  const src = tokens(`${titleCore} ${h1}`);
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= src.length; i++) {
      const gram = src.slice(i, i + n).join(' ');
      const inSlug = slug.includes(gram) ? 1.5 : 0;
      add(gram, 0.5 + inSlug);
    }
  }

  const ranked = [...candidates.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return { keyword: titleCore || slug, confidence: 0.2 };
  const [best, score] = ranked[0]!;
  const confidence = Math.min(1, score / 6);
  return { keyword: best, confidence };
}
