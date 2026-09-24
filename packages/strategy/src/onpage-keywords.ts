import { isStopword, normalize } from './text.js';

/**
 * Phase 5 — real on-page keyword analysis. Unlike `guessTargetKeyword` /
 * `assignPageTargets`'s `pageHaystack` (title + H1 + slug only, set-overlap, no
 * frequency), this reads the actual heading structure + body copy captured by the
 * crawler and counts REAL occurrences, weighted by where they appear:
 * H1 > H2/H3 > Title > URL > first paragraph > rest of the text.
 * PURE — no I/O. Search volume and the "target keyword" to audit against are
 * supplied by the caller (already-fetched data), never fetched here.
 */

export interface OnPageInput {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: { level: number; text: string }[];
  mainText: string | null;
  images?: { src: string; alt: string | null }[];
}

export interface RankedKeyword {
  phrase: string;
  /** Total real occurrences across the page (title + headings + body). */
  occurrences: number;
  /** Position-weighted relevance score (not a percentage — for ranking only). */
  score: number;
  foundIn: { h1: boolean; h2: boolean; title: boolean; url: boolean; intro: boolean; body: boolean };
  /** From the site's own keyword universe, when this phrase matches a known keyword. */
  searchVolume: number | null;
}

export type LengthStatus = 'missing' | 'short' | 'ok' | 'long';

export interface MetaAudit {
  /** Thresholds match packages/scoring rules onpage.title-length / onpage.meta-description. */
  title: {
    text: string | null;
    length: number;
    lengthStatus: LengthStatus;
    hasPrimaryKeyword: boolean;
    keywordNearStart: boolean;
  };
  metaDescription: {
    text: string | null;
    length: number;
    lengthStatus: LengthStatus;
    hasPrimaryKeyword: boolean;
  };
  h1: { text: string | null; hasPrimaryKeyword: boolean };
  altTexts: {
    totalImages: number;
    missingAlt: number;
    withPrimaryKeyword: number;
    /** Same alt text repeated with the exact keyword on most images — a stuffing smell. */
    stuffingRisk: boolean;
  };
}

export interface OnPageAnalysis {
  headingTree: { level: number; text: string }[];
  keywords: RankedKeyword[];
  /** The keyword the meta audit was checked against (opts.targetKeyword, else keywords[0]). */
  primaryKeyword: string | null;
  meta: MetaAudit;
}

export interface AnalyzeOnPageOpts {
  volumeByKeyword?: Map<string, number>;
  /** Audit title/meta/H1/alt against this keyword instead of the self-detected top phrase
   * (pass the page's assigned blueprint target, when there is one). */
  targetKeyword?: string | null;
  maxKeywords?: number;
}

function rawWords(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean);
}

function slugWords(url: string): string {
  try {
    return new URL(url).pathname.replace(/[/_-]+/g, ' ').trim();
  } catch {
    return '';
  }
}

/** n-grams (2..4 words) that don't start/end on a stopword — keeps natural phrases
 * like "canapele cu ladă" while filtering "cu ladă de" style fragments. Single words
 * are excluded on purpose: a lone root word is never a useful "target keyword" row,
 * and its raw frequency would otherwise always outrank the specific phrases built
 * from it (every occurrence of "canapele extensibile" is also one of "canapele"). */
function candidatePhrases(text: string, maxN = 4): Set<string> {
  const words = rawWords(text);
  const out = new Set<string>();
  for (let n = 2; n <= maxN; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const slice = words.slice(i, i + n);
      if (isStopword(slice[0]!) || isStopword(slice[n - 1]!)) continue;
      out.add(slice.join(' '));
    }
  }
  return out;
}

/** Exact-sequence occurrence count of `phrase` inside pre-split `words` (order-sensitive). */
function countPhraseInWords(words: string[], phrase: string): number {
  const p = rawWords(phrase);
  if (p.length === 0 || words.length < p.length) return 0;
  let n = 0;
  for (let i = 0; i + p.length <= words.length; i++) {
    let match = true;
    for (let j = 0; j < p.length; j++) {
      if (words[i + j] !== p[j]) {
        match = false;
        break;
      }
    }
    if (match) n++;
  }
  return n;
}

/** Exact-sequence occurrence count of `phrase` inside `text` (order-sensitive). */
function countPhraseIn(text: string, phrase: string): number {
  return countPhraseInWords(rawWords(text), phrase);
}

function lengthStatus(len: number, min: number, max: number): LengthStatus {
  if (len === 0) return 'missing';
  if (len < min) return 'short';
  if (len > max) return 'long';
  return 'ok';
}

const ZONE_WEIGHT = { h1: 5, title: 4, h2: 3, url: 2.5, intro: 2, body: 1 } as const;
const INTRO_WORDS = 60;

export interface Zone {
  key: keyof typeof ZONE_WEIGHT;
  /** Pre-split so scoring many candidate phrases against the same page doesn't
   * re-tokenize the (potentially several-thousand-word) body text every time. */
  words: string[];
  occCap: number;
}

interface ZonePageInput {
  title?: string | null;
  h1?: string | null;
  headings: { level: number; text: string }[];
  url: string;
  mainText?: string | null;
}

function buildZones(page: ZonePageInput): { zones: Zone[]; fullCorpus: string } {
  const title = page.title ?? '';
  const titleCore = title.split(/[|\-–—:·]/)[0]?.trim() ?? title;
  const h1 = page.h1 ?? '';
  const h2Text = page.headings
    .filter((h) => h.level === 2 || h.level === 3)
    .map((h) => h.text)
    .join('. ');
  const bodyWords = rawWords(page.mainText ?? '');
  const introWords = bodyWords.slice(0, INTRO_WORDS);
  const restWords = bodyWords.slice(INTRO_WORDS);

  const zones: Zone[] = [
    { key: 'h1', words: rawWords(h1), occCap: 3 },
    { key: 'title', words: rawWords(titleCore), occCap: 3 },
    { key: 'h2', words: rawWords(h2Text), occCap: 6 },
    { key: 'url', words: rawWords(slugWords(page.url)), occCap: 2 },
    { key: 'intro', words: introWords, occCap: 3 },
    { key: 'body', words: restWords, occCap: 12 },
  ];
  // Candidates need everywhere real copy lives — title/H1/H2 alone are too thin.
  const fullCorpus = [title, h1, h2Text, page.mainText ?? ''].filter(Boolean).join('. ');
  return { zones, fullCorpus };
}

function zoneScore(
  zones: Zone[],
  phrase: string,
): { score: number; foundIn: RankedKeyword['foundIn'] } {
  let score = 0;
  const foundIn = { h1: false, h2: false, title: false, url: false, intro: false, body: false };
  for (const z of zones) {
    const occ = countPhraseInWords(z.words, phrase);
    if (occ > 0) {
      foundIn[z.key] = true;
      score += ZONE_WEIGHT[z.key] * Math.min(occ, z.occCap);
    }
  }
  return { score, foundIn };
}

/**
 * Precompute a page's zone texts once, then score many candidate keywords against it
 * cheaply (`zoneFitScore`) — use this instead of `pageKeywordFit` in a loop over many
 * keywords per page (e.g. `assignPageTargets`), which would otherwise re-split the same
 * body text on every call.
 */
export interface PageZoneIndex {
  zones: Zone[];
}
export function indexPageZones(page: ZonePageInput): PageZoneIndex {
  return { zones: buildZones(page).zones };
}

/** Calibrated so "found in H1 + title + one H2 mention" (5+4+3=12) reads as a strong fit;
 * a couple of lone body mentions (1-3) reads as a weak one. */
export function zoneFitScore(index: PageZoneIndex, keyword: string): number {
  const { score } = zoneScore(index.zones, keyword);
  return Math.max(0, Math.min(1, score / 14));
}

/**
 * How well an ARBITRARY keyword fits a page's actual content — H1 > Title > H2 > URL >
 * intro > body, same weighting as `analyzeOnPage`. For a one-off check; prefer
 * `indexPageZones` + `zoneFitScore` when scoring many keywords against the same page.
 * 0..1. A page with no headings/body text (nothing to read beyond title) simply scores
 * low here — callers should blend with a title/slug-only fallback rather than replace
 * it, so behaviour never regresses for thin pages.
 */
export function pageKeywordFit(page: ZonePageInput, keyword: string): number {
  return zoneFitScore(indexPageZones(page), keyword);
}

export function analyzeOnPage(page: OnPageInput, opts: AnalyzeOnPageOpts = {}): OnPageAnalysis {
  const title = page.title ?? '';
  const h1 = page.h1 ?? '';
  const { zones, fullCorpus } = buildZones(page);

  const candidates = candidatePhrases(fullCorpus, 4);

  const ranked: RankedKeyword[] = [];
  for (const phrase of candidates) {
    const { score, foundIn } = zoneScore(zones, phrase);
    // Total occurrences from one canonical corpus (title+H1+H2+body) — no double counting.
    const totalOcc = countPhraseIn(fullCorpus, phrase);
    // Drop one-off noise unless it's a strong positional signal (H1/title).
    if (totalOcc < 2 && !foundIn.h1 && !foundIn.title) continue;
    if (score <= 0) continue;
    const norm = normalize(phrase);
    ranked.push({
      phrase,
      occurrences: totalOcc,
      score: Math.round(score * 10) / 10,
      foundIn,
      searchVolume: opts.volumeByKeyword?.get(norm) ?? null,
    });
  }
  ranked.sort((a, b) => b.score - a.score || b.occurrences - a.occurrences);

  // Dedupe: drop a shorter phrase fully contained in a higher-ranked longer one
  // with the same occurrence count (e.g. "canapele extensibile" swallowed by
  // "canapele extensibile moderne" when they co-occur identically).
  const deduped: RankedKeyword[] = [];
  for (const cand of ranked) {
    const isSubsumed = deduped.some(
      (kept) =>
        kept.occurrences === cand.occurrences &&
        kept.phrase !== cand.phrase &&
        kept.phrase.includes(cand.phrase),
    );
    if (!isSubsumed) deduped.push(cand);
  }

  const top = deduped.slice(0, opts.maxKeywords ?? 20);
  const primaryKeyword = opts.targetKeyword ?? top[0]?.phrase ?? null;

  const titleLen = title.trim().length;
  const descLen = (page.metaDescription ?? '').trim().length;
  const hasKw = (text: string) => (primaryKeyword ? countPhraseIn(text, primaryKeyword) > 0 : false);
  const titleWords = rawWords(title);
  const kwWords = primaryKeyword ? rawWords(primaryKeyword) : [];
  let kwStartIdx = -1;
  if (kwWords.length && titleWords.length >= kwWords.length) {
    for (let i = 0; i + kwWords.length <= titleWords.length; i++) {
      if (kwWords.every((w, j) => titleWords[i + j] === w)) {
        kwStartIdx = i;
        break;
      }
    }
  }
  const keywordNearStart = kwStartIdx >= 0 && kwStartIdx <= Math.ceil(titleWords.length / 2);

  const images = page.images ?? [];
  const missingAlt = images.filter((i) => !i.alt || !i.alt.trim()).length;
  const withPrimaryKeyword = primaryKeyword
    ? images.filter((i) => i.alt && countPhraseIn(i.alt, primaryKeyword) > 0).length
    : 0;
  const stuffingRisk = images.length >= 3 && withPrimaryKeyword / images.length > 0.6;

  return {
    headingTree: page.headings,
    keywords: top,
    primaryKeyword,
    meta: {
      title: {
        text: page.title,
        length: titleLen,
        lengthStatus: lengthStatus(titleLen, 30, 60),
        hasPrimaryKeyword: hasKw(title),
        keywordNearStart,
      },
      metaDescription: {
        text: page.metaDescription,
        length: descLen,
        lengthStatus: lengthStatus(descLen, 120, 160),
        hasPrimaryKeyword: hasKw(page.metaDescription ?? ''),
      },
      h1: { text: page.h1, hasPrimaryKeyword: hasKw(h1) },
      altTexts: { totalImages: images.length, missingAlt, withPrimaryKeyword, stuffingRisk },
    },
  };
}
