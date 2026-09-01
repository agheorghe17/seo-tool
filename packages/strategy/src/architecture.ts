/**
 * Epic 23 — site architecture recommendation. PURE. Turns the keyword universe + the
 * current page→keyword map into a recommended pillar/supporting structure.
 */
import { tokenSimilarity } from './text.js';

export interface ArchCluster {
  id: string;
  name: string;
  members: string[]; // keywords
}

export interface ArchAssignment {
  url: string;
  targetKeyword: string | null;
  clusterId: string | null;
  isHomepage?: boolean;
}

export interface ArchNode {
  cluster: string;
  clusterId: string;
  keyword: string;
  haveUrl: string | null;
  memberCount: number;
  children: { keyword: string; haveUrl: string | null }[];
}

export interface ArchitecturePlan {
  pillars: ArchNode[];
  supporting: { cluster: string; clusterId: string; haveUrl: string | null; count: number }[];
  orphanClusters: { cluster: string; clusterId: string; memberCount: number }[];
  merges: { a: string; b: string }[];
  coverage: { pillarsNeeded: number; pillarsHave: number };
}

export function recommendArchitecture(
  clusters: ArchCluster[],
  assignments: ArchAssignment[],
  opts: { pillarMinMembers?: number } = {},
): ArchitecturePlan {
  const pillarMin = opts.pillarMinMembers ?? 4;
  const urlByCluster = new Map<string, string[]>();
  for (const a of assignments) {
    if (!a.clusterId) continue;
    const arr = urlByCluster.get(a.clusterId) ?? [];
    arr.push(a.url);
    urlByCluster.set(a.clusterId, arr);
  }

  const pillars: ArchNode[] = [];
  const supporting: ArchitecturePlan['supporting'] = [];
  const orphanClusters: ArchitecturePlan['orphanClusters'] = [];

  for (const c of clusters) {
    const urls = urlByCluster.get(c.id) ?? [];
    const haveUrl = urls[0] ?? null;
    if (c.members.length >= pillarMin) {
      pillars.push({
        cluster: c.name,
        clusterId: c.id,
        keyword: c.members[0] ?? c.name,
        haveUrl,
        memberCount: c.members.length,
        children: c.members.slice(1, 7).map((k) => ({
          keyword: k,
          haveUrl: assignments.find((a) => a.targetKeyword === k)?.url ?? null,
        })),
      });
    } else if (urls.length === 0 && c.members.length > 0) {
      orphanClusters.push({ cluster: c.name, clusterId: c.id, memberCount: c.members.length });
    } else {
      supporting.push({ cluster: c.name, clusterId: c.id, haveUrl, count: c.members.length });
    }
  }

  // Suggest merging near-duplicate clusters (by name similarity).
  const merges: { a: string; b: string }[] = [];
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      if (tokenSimilarity(clusters[i]!.name, clusters[j]!.name) >= 0.6) {
        merges.push({ a: clusters[i]!.name, b: clusters[j]!.name });
      }
    }
  }

  pillars.sort((a, b) => b.memberCount - a.memberCount);
  return {
    pillars,
    supporting: supporting.sort((a, b) => b.count - a.count),
    orphanClusters: orphanClusters.sort((a, b) => b.memberCount - a.memberCount),
    merges: merges.slice(0, 8),
    coverage: {
      pillarsNeeded: pillars.length,
      pillarsHave: pillars.filter((p) => p.haveUrl).length,
    },
  };
}
