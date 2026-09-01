/**
 * Epic 23 — cannibalisation resolver. PURE. Given a group of the site's own pages that
 * compete for the same keyword, decide which one to keep and how to consolidate the rest.
 */
import { pageContentGap } from './gap.js';
import type { PageLike } from './types.js';

export interface CannibalPage extends PageLike {
  currentPosition?: number | null;
  fit?: number | null;
}

export interface CannibalizationPlan {
  keyword: string;
  canonicalUrl: string;
  redirects: { from: string; to: string }[];
  mergeInstructions: string[];
}

export function resolveCannibalization(group: CannibalPage[], keyword: string): CannibalizationPlan | null {
  if (group.length < 2) return null;

  // Canonical: best current position (if any), then best fit, then most content.
  const ranked = [...group].sort((a, b) => {
    const pa = a.currentPosition ?? 999;
    const pb = b.currentPosition ?? 999;
    if (pa !== pb) return pa - pb;
    const fa = a.fit ?? 0;
    const fb = b.fit ?? 0;
    if (fa !== fb) return fb - fa;
    return b.wordCount - a.wordCount;
  });
  const canonical = ranked[0]!;
  const others = ranked.slice(1);

  const mergeInstructions: string[] = [];
  for (const other of others) {
    const gap = pageContentGap(canonical, other);
    const bring = gap.missingHeadings.slice(0, 5);
    if (bring.length > 0) {
      mergeInstructions.push(
        `Din ${short(other.url)}: mută în pagina canonică secțiunile „${bring.join('", "')}".`,
      );
    } else {
      mergeInstructions.push(
        `${short(other.url)} nu aduce conținut unic — pune 301 direct spre pagina canonică.`,
      );
    }
  }
  mergeInstructions.push(
    `Setează canonical + 301 de la fiecare pagină veche spre ${short(canonical.url)} și actualizează linkurile interne.`,
  );

  return {
    keyword,
    canonicalUrl: canonical.url,
    redirects: others.map((o) => ({ from: o.url, to: canonical.url })),
    mergeInstructions,
  };
}

function short(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}
