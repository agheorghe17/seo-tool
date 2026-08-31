'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from '@/components/AuthProvider';

/** Response shapes from apps/api. Kept loose on purpose — the API owns the source of truth. */
export interface SiteDto {
  id: string;
  domain: string;
  connectionType: 'wordpress' | 'universal';
  verificationMethod: string | null;
  verificationToken: string;
  verifiedAt: string | null;
  verified: boolean;
  gscConnected: boolean;
  wpSiteUrl: string | null;
  lastCrawl: CrawlDto | null;
}

export interface CrawlDto {
  id: string;
  siteId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'partial';
  pagesTotal: number;
  pagesScanned: number;
  pagesRendered: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  progressPct?: number;
}

export interface CrawlSummaryDto {
  pages: number;
  scores: Record<'technical' | 'cwv' | 'onpage' | 'content' | 'geo' | 'total', number | null>;
  issues: Partial<Record<'critical' | 'warning' | 'info', number>>;
}

export interface PageDto {
  id: string;
  url: string;
  statusCode: number | null;
  indexability: string | null;
  renderedWith: string;
  wordCount: number;
  lcpMs: number | null;
  inpMs: number | null;
  clsScore: number | null;
  scoreTechnical: number | null;
  scoreCwv: number | null;
  scoreOnpage: number | null;
  scoreContent: number | null;
  scoreGeo: number | null;
  scoreTotal: number | null;
}

export interface IssueDto {
  id: string;
  ruleId: string;
  category: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  detectedValue: string | null;
  siteLevel: boolean;
}

export interface RecommendationDto {
  reco: {
    id: string;
    fixTitle: string;
    fixDescriptionAiGenerated: string | null;
    llmProvider: string | null;
    impactScore: number;
    effortScore: number;
    priorityRank: number;
    autoFixable: boolean;
    applied: boolean;
    appliedAt: string | null;
  };
  ruleId: string;
}

export interface TrafficEstimateDto {
  id: string;
  baselineMonthlyVisits: number;
  baselineSource: 'gsc' | 'keyword_model';
  estimateLow: number;
  estimateMid: number;
  estimateHigh: number;
  horizonMonths: number;
  assumptions: string[];
  series: { month: number; low: number; mid: number; high: number }[];
  confidenceLevel: 'low' | 'medium' | 'high';
  generatedAt: string;
}

function useToken() {
  return useAuth().token;
}

export function useSites() {
  const token = useToken();
  return useQuery({
    queryKey: ['sites'],
    queryFn: () => apiFetch<{ sites: SiteDto[] }>('/api/sites', { token }).then((r) => r.sites),
    enabled: !!token,
  });
}

export function useSite(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['site', siteId],
    queryFn: () =>
      apiFetch<{ site: SiteDto }>(`/api/sites/${siteId}`, { token }).then((r) => r.site),
    enabled: !!token,
  });
}

export function useCrawl(crawlId: string, poll = false) {
  const token = useToken();
  return useQuery({
    queryKey: ['crawl', crawlId],
    queryFn: () =>
      apiFetch<{ crawl: CrawlDto }>(`/api/crawls/${crawlId}`, { token }).then((r) => r.crawl),
    enabled: !!token,
    refetchInterval: poll ? 2000 : false,
  });
}

export function useCrawlSummary(crawlId: string | undefined) {
  const token = useToken();
  return useQuery({
    queryKey: ['crawl-summary', crawlId],
    queryFn: () =>
      apiFetch<{ summary: CrawlSummaryDto }>(`/api/crawls/${crawlId}/summary`, { token }).then(
        (r) => r.summary,
      ),
    enabled: !!token && !!crawlId,
  });
}

export function useCrawlPages(crawlId: string | undefined) {
  const token = useToken();
  return useQuery({
    queryKey: ['crawl-pages', crawlId],
    queryFn: () =>
      apiFetch<{ pages: PageDto[] }>(`/api/crawls/${crawlId}/pages?limit=500`, { token }).then(
        (r) => r.pages,
      ),
    enabled: !!token && !!crawlId,
  });
}

export function usePage(pageId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['page', pageId],
    queryFn: () =>
      apiFetch<{ page: PageDto; crawlId: string; siteId: string }>(`/api/pages/${pageId}`, {
        token,
      }),
    enabled: !!token,
  });
}

export function usePageIssues(pageId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['page-issues', pageId],
    queryFn: () =>
      apiFetch<{ issues: IssueDto[] }>(`/api/pages/${pageId}/issues`, { token }).then(
        (r) => r.issues,
      ),
    enabled: !!token,
  });
}

export function usePageRecommendations(pageId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['page-recos', pageId],
    queryFn: () =>
      apiFetch<{ recommendations: RecommendationDto[] }>(`/api/pages/${pageId}/recommendations`, {
        token,
      }).then((r) => r.recommendations),
    enabled: !!token,
  });
}

export function useTrafficEstimate(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['estimate', siteId],
    queryFn: () =>
      apiFetch<{ estimate: TrafficEstimateDto }>(`/api/sites/${siteId}/traffic-estimate`, {
        token,
      }).then((r) => r.estimate),
    enabled: !!token,
    retry: false,
  });
}

export function useStartCrawl(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ crawlId: string }>(`/api/sites/${siteId}/crawls`, { method: 'POST', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', siteId] }),
  });
}

export function useVerifySite(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (method: string) =>
      apiFetch<{ verified: boolean; reason?: string }>(`/api/sites/${siteId}/verify`, {
        method: 'POST',
        token,
        body: JSON.stringify({ method }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', siteId] }),
  });
}

export function useApplyRecommendation(pageId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      body: { metaTitle?: string; metaDescription?: string; altText?: string; mediaId?: number };
    }) =>
      apiFetch(`/api/recommendations/${vars.id}/apply`, {
        method: 'POST',
        token,
        body: JSON.stringify(vars.body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-recos', pageId] }),
  });
}

export function useCreateSite() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { domain: string; connectionType: 'universal' | 'wordpress' }) =>
      apiFetch<{ site: SiteDto }>('/api/sites', {
        method: 'POST',
        token,
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useConnectWordpress(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { wpSiteUrl: string; username: string; applicationPassword: string }) =>
      apiFetch<{ ok: boolean; seoPlugin: string | null }>(`/api/sites/${siteId}/wordpress`, {
        method: 'POST',
        token,
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', siteId] }),
  });
}

export function useConnectGsc(siteId: string) {
  const token = useToken();
  return useMutation({
    mutationFn: (property?: string) =>
      apiFetch<{ authUrl: string }>(`/api/sites/${siteId}/gsc/connect`, {
        method: 'POST',
        token,
        body: JSON.stringify(property ? { property } : {}),
      }),
    onSuccess: (r) => {
      if (typeof window !== 'undefined') window.location.href = r.authUrl;
    },
  });
}

export function useRecomputeEstimate(siteId: string) {
  const token = useToken();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/api/sites/${siteId}/traffic-estimate`, { method: 'POST', token }),
  });
}

export function useRollbackRecommendation(pageId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/recommendations/${id}/rollback`, { method: 'POST', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-recos', pageId] }),
  });
}
