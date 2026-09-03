'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from '@/components/AuthProvider';

export interface BusinessProfile {
  id: string;
  summary: string | null;
  services: string[];
  locations: string[];
  languages: string[];
  audience: string | null;
  geoCountry: string | null;
  geoLanguage: string | null;
  primaryCity: string | null;
  localEmphasis: boolean;
  autoPublishBlog: boolean;
  confirmedAt: string | null;
}

export interface KeywordRow {
  id: string;
  keyword: string;
  searchVolume: number;
  currentPosition: number | null;
  competition: number | null;
  intent: string | null;
  bucket: string;
  businessRelevance: number | null;
  opportunityScore: number | null;
  hasTargetPage: boolean;
  clusterId: string | null;
}

export interface StrategyOverview {
  hasProfile: boolean;
  profileConfirmed: boolean;
  keywords: number;
  ranking: number;
  top10: number;
  top3: number;
  striking: number;
  avgPosition: number | null;
  roadmapTotal: number;
  roadmapDone: number;
}

export interface CompetitorRow {
  id: string;
  domain: string;
  label: string | null;
  pagesCrawled: number;
  lastCrawlAt: string | null;
}

export interface RoadmapItem {
  id: string;
  phase: number;
  title: string;
  why: string | null;
  effort: number;
  impact: number;
  status: 'todo' | 'doing' | 'done' | 'skipped';
  keywordId: string | null;
}

export interface KeywordDetail {
  keyword: KeywordRow;
  rankHistory: { capturedAt: string; position: number | null; source: string }[];
  serp: { position: number; domain: string; url: string | null; title: string | null; isOwn: boolean }[];
  playbook: {
    brief: {
      title?: string;
      slug?: string;
      h2s?: string[];
      mustCover?: string[];
      faqs?: string[];
      internalLinks?: string[];
    } | null;
    checklist: { item: string; done: boolean }[];
  } | null;
  cluster: { name: string } | null;
}

function useToken() {
  return useAuth().token;
}

export function useStrategyOverview(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['strategy-overview', siteId],
    queryFn: () =>
      apiFetch<{ overview: StrategyOverview }>(`/api/sites/${siteId}/strategy/overview`, {
        token,
      }).then((r) => r.overview),
    enabled: !!token,
  });
}

export function useProfile(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['profile', siteId],
    queryFn: () =>
      apiFetch<{ profile: BusinessProfile | null }>(`/api/sites/${siteId}/profile`, { token }).then(
        (r) => r.profile,
      ),
    enabled: !!token,
  });
}

export function useSaveProfile(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<BusinessProfile> & { confirmed?: boolean }) =>
      apiFetch(`/api/sites/${siteId}/profile`, {
        method: 'PUT',
        token,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', siteId] });
      qc.invalidateQueries({ queryKey: ['strategy-overview', siteId] });
    },
  });
}

export function useRebuildStrategy(siteId: string) {
  const token = useToken();
  return useMutation({
    mutationFn: () => apiFetch(`/api/sites/${siteId}/strategy/rebuild`, { method: 'POST', token }),
  });
}

export function useKeywords(
  siteId: string,
  filters: { bucket?: string; intent?: string; rank?: string; cluster?: string } = {},
) {
  const token = useToken();
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  ).toString();
  return useQuery({
    queryKey: ['keywords', siteId, qs],
    queryFn: () =>
      apiFetch<{ keywords: KeywordRow[]; total: number }>(
        `/api/sites/${siteId}/keywords?limit=300${qs ? `&${qs}` : ''}`,
        { token },
      ),
    enabled: !!token,
  });
}

export function useKeywordDetail(siteId: string, kwId: string | null) {
  const token = useToken();
  return useQuery({
    queryKey: ['keyword-detail', kwId],
    queryFn: () =>
      apiFetch<KeywordDetail>(`/api/sites/${siteId}/keywords/${kwId}`, { token }),
    enabled: !!token && !!kwId,
  });
}

export function useOpportunities(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['opportunities', siteId],
    queryFn: () =>
      apiFetch<{ opportunities: Record<string, KeywordRow[]> }>(
        `/api/sites/${siteId}/opportunities`,
        { token },
      ).then((r) => r.opportunities),
    enabled: !!token,
  });
}

export function useCompetitors(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['competitors', siteId],
    queryFn: () =>
      apiFetch<{ competitors: CompetitorRow[] }>(`/api/sites/${siteId}/competitors`, { token }).then(
        (r) => r.competitors,
      ),
    enabled: !!token,
  });
}

export function useAddCompetitor(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) =>
      apiFetch(`/api/sites/${siteId}/competitors`, {
        method: 'POST',
        token,
        body: JSON.stringify({ domain }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitors', siteId] }),
  });
}

export function useDeleteCompetitor(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cId: string) =>
      apiFetch(`/api/sites/${siteId}/competitors/${cId}`, { method: 'DELETE', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitors', siteId] }),
  });
}

export function useCompetitorGap(siteId: string, cId: string | null) {
  const token = useToken();
  return useQuery({
    queryKey: ['competitor-gap', cId],
    queryFn: () =>
      apiFetch<{
        coverage: { cluster: string; yourPages: number; competitorPages: number; gap: number }[];
        examples: { url: string; keyword: string; gap: { missingHeadings: string[] } }[];
      }>(`/api/sites/${siteId}/competitors/${cId}/gap`, { token }),
    enabled: !!token && !!cId,
  });
}

export function useRoadmap(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['roadmap', siteId],
    queryFn: () =>
      apiFetch<{ roadmap: RoadmapItem[] }>(`/api/sites/${siteId}/roadmap`, { token }).then(
        (r) => r.roadmap,
      ),
    enabled: !!token,
  });
}

export function useUpdateRoadmapItem(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: RoadmapItem['status'] }) =>
      apiFetch(`/api/roadmap/${vars.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roadmap', siteId] });
      qc.invalidateQueries({ queryKey: ['strategy-overview', siteId] });
    },
  });
}
