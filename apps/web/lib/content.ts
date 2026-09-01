'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from '@/components/AuthProvider';

export interface ContentDraft {
  id: string;
  siteId: string;
  keywordId: string | null;
  status: 'idea' | 'prompt_ready' | 'review' | 'published' | 'discarded';
  title: string | null;
  promptText: string | null;
  articleMd: string | null;
  wpPostId: number | null;
  wpEditLink: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface ContentIdea {
  id: string; // keyword id
  keyword: string;
  intent: string | null;
  opportunityScore: number | null;
  bucket: string;
  hasTargetPage: boolean;
}

function useToken() {
  return useAuth().token;
}

export function useContent(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['content', siteId],
    queryFn: () =>
      apiFetch<{ drafts: ContentDraft[]; ideas: ContentIdea[] }>(`/api/sites/${siteId}/content`, {
        token,
      }),
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

export function useSaveArticle(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; articleMd: string; title?: string }) =>
      apiFetch<{ draft: ContentDraft }>(`/api/content/${vars.id}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ articleMd: vars.articleMd, title: vars.title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content', siteId] }),
  });
}

export function usePublishDraft(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ draft: ContentDraft; editLink?: string }>(`/api/content/${id}/publish`, {
        method: 'POST',
        token,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content', siteId] });
      qc.invalidateQueries({ queryKey: ['home', siteId] });
    },
  });
}

export function useDiscardDraft(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/content/${id}/discard`, { method: 'POST', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content', siteId] }),
  });
}
