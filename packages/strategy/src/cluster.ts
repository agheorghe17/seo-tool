import { tokens } from './text.js';

export interface Cluster {
  name: string;
  pillar: string;
  members: string[];
}

/**
 * Epic 14.2 — group keywords into topic clusters. Embedding-free: connected components
 * over "shares >= 1 significant non-generic token", pillar = shortest / highest-volume member.
 */
export function clusterKeywords(
  keywords: { keyword: string; searchVolume?: number | null }[],
  opts: { minShared?: number; maxClusters?: number } = {},
): Cluster[] {
  const minShared = opts.minShared ?? 1;
  const items = keywords.map((k) => ({ ...k, toks: new Set(tokens(k.keyword)) }));

  // Token frequency. Only on a LARGE set does a near-ubiquitous token ("servicii", "agentie")
  // stop binding a cluster — on small sets those tokens are exactly the topic.
  const freq = new Map<string, number>();
  for (const it of items) for (const t of it.toks) freq.set(t, (freq.get(t) ?? 0) + 1);
  const generic =
    items.length >= 8
      ? new Set([...freq.entries()].filter(([, n]) => n > items.length * 0.6).map(([t]) => t))
      : new Set<string>();

  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      let shared = 0;
      for (const t of items[i]!.toks) {
        if (!generic.has(t) && items[j]!.toks.has(t)) shared++;
      }
      if (shared >= minShared) union(i, j);
    }
  }

  const groups = new Map<number, typeof items>();
  items.forEach((it, i) => {
    const root = find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(it);
  });

  const clusters: Cluster[] = [...groups.values()].map((members) => {
    const pillar =
      [...members].sort(
        (a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0) || a.keyword.length - b.keyword.length,
      )[0]?.keyword ?? members[0]!.keyword;
    // Name = the 1-2 non-generic tokens most common in the cluster.
    const nameFreq = new Map<string, number>();
    for (const m of members)
      for (const t of m.toks) if (!generic.has(t)) nameFreq.set(t, (nameFreq.get(t) ?? 0) + 1);
    const name =
      [...nameFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([t]) => t)
        .join(' ') || pillar;
    return { name, pillar, members: members.map((m) => m.keyword) };
  });

  clusters.sort((a, b) => b.members.length - a.members.length);
  return opts.maxClusters ? clusters.slice(0, opts.maxClusters) : clusters;
}
