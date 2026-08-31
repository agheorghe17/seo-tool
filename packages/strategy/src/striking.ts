/**
 * Epic 15.3 — "striking distance" keywords (page 2 / bottom of page 1: a small push lands
 * them on page 1) + keyword cannibalization (one query, several URLs) from GSC data.
 */
export interface GscQueryRow {
  keyword: string;
  page: string;
  position: number;
  impressions: number;
  clicks: number;
}

export interface StrikingKeyword {
  keyword: string;
  page: string;
  position: number;
  impressions: number;
}

export function strikingDistance(
  rows: GscQueryRow[],
  opts: { minPos?: number; maxPos?: number; minImpressions?: number } = {},
): StrikingKeyword[] {
  const minPos = opts.minPos ?? 5;
  const maxPos = opts.maxPos ?? 20;
  const minImpr = opts.minImpressions ?? 20;
  // Best (lowest-position) row per keyword.
  const best = new Map<string, GscQueryRow>();
  for (const r of rows) {
    const cur = best.get(r.keyword);
    if (!cur || r.position < cur.position) best.set(r.keyword, r);
  }
  return [...best.values()]
    .filter((r) => r.position >= minPos && r.position <= maxPos && r.impressions >= minImpr)
    .sort((a, b) => b.impressions - a.impressions)
    .map((r) => ({
      keyword: r.keyword,
      page: r.page,
      position: Math.round(r.position * 10) / 10,
      impressions: r.impressions,
    }));
}

export interface Cannibalization {
  keyword: string;
  pages: { page: string; position: number; impressions: number }[];
}

export function cannibalization(rows: GscQueryRow[], minImpressions = 10): Cannibalization[] {
  const byKw = new Map<string, GscQueryRow[]>();
  for (const r of rows) {
    if (r.impressions < minImpressions) continue;
    (byKw.get(r.keyword) ?? byKw.set(r.keyword, []).get(r.keyword)!).push(r);
  }
  const out: Cannibalization[] = [];
  for (const [keyword, rs] of byKw) {
    const pages = [...new Map(rs.map((r) => [r.page, r])).values()];
    if (pages.length >= 2) {
      out.push({
        keyword,
        pages: pages
          .sort((a, b) => a.position - b.position)
          .map((p) => ({ page: p.page, position: Math.round(p.position * 10) / 10, impressions: p.impressions })),
      });
    }
  }
  return out.sort((a, b) => b.pages.length - a.pages.length);
}
