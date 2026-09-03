'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from '@/components/AuthProvider';
import { pushToast } from './toast';

function useToken() {
  return useAuth().token;
}

/* ---- D1: interventions ------------------------------------------------------ */

export interface Intervention {
  id: string;
  kind: string;
  category: string | null;
  targetUrl: string | null;
  label: string;
  appliedAt: string;
  outcome: 'pending' | 'gain' | 'loss' | 'flat' | 'inconclusive';
  deltaPosition: number | null;
  deltaClicks: number | null;
}

export function useInterventions(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['interventions', siteId],
    queryFn: () =>
      apiFetch<{
        interventions: Intervention[];
        summary: {
          total: number;
          pending: number;
          gains: number;
          losses: number;
          avgPositionGain: number | null;
        };
      }>(`/api/sites/${siteId}/interventions`, { token }),
    enabled: !!token,
  });
}

/* ---- D3: content decay ---------------------------------------------------- */

export interface DecayFinding {
  url: string;
  monthsDeclining: number;
  clicksDropPct: number;
  peakMonth: string;
  peakClicks: number;
  currentClicks: number;
  positionDrift: number | null;
  reason: 'traffic_decline' | 'ranking_loss';
}

export function useDecay(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['decay', siteId],
    queryFn: () =>
      apiFetch<{ findings: DecayFinding[]; hasHistory: boolean; gscConnected: boolean }>(
        `/api/sites/${siteId}/decay`,
        { token },
      ),
    enabled: !!token,
  });
}

/* ---- D4: internal links ------------------------------------------------------ */

export interface LinkAudit {
  orphans: string[];
  underlinked: { url: string; targetKeyword: string | null; inbound: number }[];
  anchorOpportunities: {
    fromUrl: string;
    toUrl: string;
    keyword: string;
    mentions: number;
    suggestedAnchor: string;
  }[];
  clusterGaps: { clusterId: string; urls: string[] }[];
  plan: { fromUrl: string; toUrl: string; anchor: string; reason: string }[];
}

export function useInternalLinks(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['internal-links', siteId],
    queryFn: () =>
      apiFetch<{ audit: LinkAudit | null; reason?: string }>(`/api/sites/${siteId}/internal-links`, {
        token,
      }),
    enabled: !!token,
  });
}

export function useMarkLinkDone(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { fromUrl: string; toUrl: string; anchor: string }) =>
      apiFetch(`/api/sites/${siteId}/internal-links/done`, {
        method: 'POST',
        token,
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      pushToast('Marcat ca făcut — îl urmărim în „Ce a funcționat".', 'success');
      qc.invalidateQueries({ queryKey: ['interventions', siteId] });
    },
  });
}

/* ---- D6: architecture --------------------------------------------------------- */

export interface ArchitecturePlan {
  pillars: {
    cluster: string;
    clusterId: string;
    keyword: string;
    haveUrl: string | null;
    memberCount: number;
    children: { keyword: string; haveUrl: string | null }[];
  }[];
  supporting: { cluster: string; clusterId: string; haveUrl: string | null; count: number }[];
  orphanClusters: { cluster: string; clusterId: string; memberCount: number }[];
  merges: { a: string; b: string }[];
  coverage: { pillarsNeeded: number; pillarsHave: number };
}

export function useArchitecture(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['architecture', siteId],
    queryFn: () =>
      apiFetch<{ architecture: ArchitecturePlan }>(`/api/sites/${siteId}/architecture`, {
        token,
      }).then((r) => r.architecture),
    enabled: !!token,
  });
}

/* ---- D7: portfolio --------------------------------------------------------- */

export interface PortfolioSite {
  id: string;
  domain: string;
  health: number | null;
  aiVisibility: number | null;
  openTasks: number;
  pendingInterventions: number;
  decayPages: number;
  lastScanAt: string | null;
  needsAttention: boolean;
  nextAction: string;
}

export function usePortfolio() {
  const token = useToken();
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: () =>
      apiFetch<{ sites: PortfolioSite[] }>('/api/portfolio', { token }).then((r) => r.sites),
    enabled: !!token,
  });
}

/* ---- Compact 30/60/90 action plan ---------------------------------------------- */

export interface PlanAction {
  id: string;
  kind: 'blueprint' | 'roadmap';
  title: string;
  why: string | null;
  url: string | null;
  keyword: string | null;
  currentPosition: number | null;
  targetPosLow: number | null;
  targetPosHigh: number | null;
  addClicksLow: number;
  addClicksHigh: number;
  qualitative: boolean;
  status: string;
  effort: number | null;
  impact: number | null;
}

export interface PlanPhase {
  days: 30 | 60 | 90;
  actions: PlanAction[];
  addClicksLow: number;
  addClicksHigh: number;
  cumulativeClicksLow: number;
  cumulativeClicksHigh: number;
}

export interface ActionPlan {
  phases: PlanPhase[];
  baselineMonthlyVisits: number;
  baselineSource: 'gsc' | 'keyword_model';
  confidence: 'low' | 'medium' | 'high';
  projectionPhases: { days: number; low: number; mid: number; high: number }[];
  assumptions: string[];
  totals: { actions: number; done: number; clicksLow: number; clicksHigh: number };
}

export function useActionPlan(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['action-plan', siteId],
    queryFn: () => apiFetch<ActionPlan>(`/api/sites/${siteId}/action-plan`, { token }),
    enabled: !!token,
  });
}

/* ---- AI agent note ----------------------------------------------------------- */

export interface AgentNote {
  summary: string;
  flags: { target: string; problem: string; suggestion: string }[];
  model: string | null;
  reviewed: number;
  createdAt: string;
}

export interface AgentNoteResponse {
  note: AgentNote | null;
  edits: { rewrites: number; reranks: number; insights: number };
}

export function useAgentNote(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['agent-note', siteId],
    queryFn: () => apiFetch<AgentNoteResponse>(`/api/sites/${siteId}/agent-note`, { token }),
    enabled: !!token,
  });
}

/* ---- D8: verify step ----------------------------------------------------------- */

export function useVerifyStep(siteId: string) {
  const token = useToken();
  return useMutation({
    mutationFn: (v: { url: string; check: string; value?: string }) =>
      apiFetch<{ pass: boolean; found: string }>(`/api/sites/${siteId}/verify-step`, {
        method: 'POST',
        token,
        body: JSON.stringify(v),
      }),
  });
}
