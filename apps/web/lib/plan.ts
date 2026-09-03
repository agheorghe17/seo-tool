'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from '@/components/AuthProvider';

export interface BlueprintRecommended {
  title: string;
  h1: string;
  metaDescription: string;
  h2Outline: string[];
  schemaType: string;
  internalLinksOut: string[];
  internalLinksIn: string[];
  wordCountTarget: number;
}

export interface BlueprintCurrent {
  title: string | null;
  h1: string | null;
  metaLen: number;
  wordCount: number;
  schemaTypes: string[];
  position: number | null;
  monthlyClicks: number | null;
}

export interface BlueprintPotential {
  searchVolume: number | null;
  volumeProxyKeyword?: string | null;
  currentClicks: number | null;
  targetPosLow: number;
  targetPosHigh: number;
  clicksLow: number;
  clicksMid: number;
  clicksHigh: number;
  qualitative: boolean;
}

export interface Blueprint {
  id: string;
  url: string;
  isHomepage: boolean;
  targetKeyword: string | null;
  secondaryKeywords: string[];
  current: BlueprintCurrent | null;
  recommended: BlueprintRecommended | null;
  potential: BlueprintPotential | null;
  rationale: string | null;
  diagnosis: 'ok' | 'cannibalization' | 'orphan_page' | 'no_target';
  priority: number;
  status: 'draft' | 'approved' | 'applied' | 'dismissed';
}

export interface PlanProjection {
  baselineMonthlyVisits: number;
  baselineSource: 'gsc' | 'keyword_model';
  confidence: 'low' | 'medium' | 'high';
  phases: { days: number; low: number; mid: number; high: number }[];
  assumptions: string[];
}

export interface CannibalizationGroup {
  keyword: string;
  canonicalUrl: string;
  redirects: { from: string; to: string }[];
  mergeInstructions: string[];
}

export interface PlanResponse {
  blueprints: Blueprint[];
  cannibalizationGroups: CannibalizationGroup[];
  market: {
    geoCountry: string | null;
    geoLanguage: string | null;
    primaryCity: string | null;
    localEmphasis: boolean;
  };
  projection: PlanProjection | null;
}

function useToken() {
  return useAuth().token;
}

export function usePlan(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['plan', siteId],
    queryFn: () => apiFetch<PlanResponse>(`/api/sites/${siteId}/plan`, { token }),
    enabled: !!token,
  });
}

export function useRebuildPlan(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/api/sites/${siteId}/plan/rebuild`, { method: 'POST', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', siteId] }),
  });
}

export function useApplyBlueprint(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bpId: string) =>
      apiFetch<{ blueprint: Blueprint }>(`/api/sites/${siteId}/blueprints/${bpId}/apply`, {
        method: 'POST',
        token,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', siteId] }),
  });
}

export function useRollbackBlueprint(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bpId: string) =>
      apiFetch(`/api/blueprints/${bpId}/rollback`, { method: 'POST', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', siteId] }),
  });
}

export function useDismissBlueprint(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: string | { bpId: string; reason?: string }) => {
      const { bpId, reason } = typeof v === 'string' ? { bpId: v, reason: undefined } : v;
      return apiFetch(`/api/sites/${siteId}/blueprints/${bpId}/dismiss`, {
        method: 'POST',
        token,
        body: JSON.stringify(reason ? { reason } : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', siteId] });
      qc.invalidateQueries({ queryKey: ['playbook', siteId] });
    },
  });
}

export function useBlueprintPrompt(siteId: string) {
  const token = useToken();
  return useMutation({
    mutationFn: (bpId: string) =>
      apiFetch<{ prompt: string }>(`/api/sites/${siteId}/blueprints/${bpId}/prompt`, {
        method: 'POST',
        token,
      }).then((r) => r.prompt),
  });
}
