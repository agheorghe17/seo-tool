/** Shared text helpers for clustering, target-keyword guessing, relevance. Pure. */

const RO_STOPWORDS = new Set(
  (
    'si de la in cu pe pentru din ce este sau un o al ale lui care ca mai fara catre dupa sub' +
    ' the a an of to for and or in on with your you we our'
  ).split(/\s+/),
);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !RO_STOPWORDS.has(t));
}

/** Jaccard similarity of two token sets. */
export function tokenSimilarity(a: string, b: string): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function slugFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '');
    return decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '');
  } catch {
    return '';
  }
}
