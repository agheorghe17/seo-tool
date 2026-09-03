'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from '@/components/AuthProvider';
import { pushToast } from './toast';

export interface ArticleCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}
export interface ArticleVerdict {
  checks: ArticleCheck[];
  score: number;
  pass: boolean;
  ranAt: string;
}

export interface ContentDraft {
  id: string;
  siteId: string;
  keywordId: string | null;
  kind: 'standalone' | 'supporting';
  status: 'idea' | 'prompt_ready' | 'review' | 'published' | 'discarded';
  title: string | null;
  promptText: string | null;
  articleMd: string | null;
  cluster: string | null;
  pillarKeyword: string | null;
  linkTo: string | null;
  linkToLabel: string | null;
  anchor: string | null;
  secondaryKeywords: string[] | null;
  targetWords: number | null;
  phase: number | null;
  estClicks: { low: number; mid: number; high: number } | null;
  verify: ArticleVerdict | null;
  autoPublished: boolean;
  wpPostId: number | null;
  wpEditLink: string | null;
  wpLink: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface ContentIdea {
  id: string;
  keyword: string;
  intent: string | null;
  opportunityScore: number | null;
}

export interface ContentResponse {
  autoPublishBlog: boolean;
  plan: { total: number; cadence: { d30: number; d60: number; d90: number }; estClicksLow: number; estClicksHigh: number };
  articles: ContentDraft[];
  standalone: ContentDraft[];
  ideas: ContentIdea[];
}

function useToken() {
  return useAuth().token;
}

export function useContent(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['content', siteId],
    queryFn: () => apiFetch<ContentResponse>(`/api/sites/${siteId}/content`, { token }),
    enabled: !!token,
  });
}

export function useStartContent(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kwId: string) =>
      apiFetch<{ draft: ContentDraft }>(`/api/sites/${siteId}/content/${kwId}/start`, {
        method: 'POST',
        token,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content', siteId] }),
  });
}

export function useBuildPrompt(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ draft: ContentDraft }>(`/api/content/${id}/prompt`, { method: 'POST', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content', siteId] }),
  });
}

export function useSaveArticle(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; articleMd: string; title?: string }) =>
      apiFetch<{ draft: ContentDraft; verdict: ArticleVerdict | null; published: { link: string } | null }>(
        `/api/content/${vars.id}`,
        { method: 'PUT', token, body: JSON.stringify({ articleMd: vars.articleMd, title: vars.title }) },
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['content', siteId] });
      if (r.published) pushToast('Verificat ✓ și publicat live pe blog.', 'success');
    },
  });
}

export function useVerifyArticle(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ draft: ContentDraft; verdict: ArticleVerdict }>(`/api/content/${id}/verify`, {
        method: 'POST',
        token,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content', siteId] }),
  });
}

export function usePublishArticle(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; force?: boolean }) =>
      apiFetch<{ draft: ContentDraft; link?: string; editLink?: string }>(
        `/api/content/${vars.id}/publish`,
        { method: 'POST', token, body: JSON.stringify({ force: vars.force }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content', siteId] });
      qc.invalidateQueries({ queryKey: ['home', siteId] });
      pushToast('Publicat live pe blog.', 'success');
    },
  });
}

export function useDiscardDraft(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/content/${id}/discard`, { method: 'POST', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content', siteId] }),
  });
}
