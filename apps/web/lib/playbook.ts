'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from '@/components/AuthProvider';
import { pushToast } from './toast';

function useToken() {
  return useAuth().token;
}

export interface PlaybookRule {
  id: string;
  siteId: string | null;
  rule: string;
  rationale: string | null;
  source: 'correction' | 'manual' | 'agent';
  active: boolean;
  createdAt: string;
}

export function usePlaybook(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['playbook', siteId],
    queryFn: () =>
      apiFetch<{ base: string; rules: PlaybookRule[] }>(`/api/sites/${siteId}/playbook`, { token }),
    enabled: !!token,
  });
}

export function useLearnRule(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { context?: string; correction: string; scope?: 'site' | 'global'; sourceRef?: string }) =>
      apiFetch<{ rule: PlaybookRule }>(`/api/sites/${siteId}/playbook/learn`, {
        method: 'POST',
        token,
        body: JSON.stringify(v),
      }),
    onSuccess: (r) => {
      pushToast(`Regulă adăugată în playbook: „${r.rule.rule}"`, 'success');
      qc.invalidateQueries({ queryKey: ['playbook', siteId] });
    },
  });
}

export function useAddRule(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { rule: string; scope?: 'site' | 'global' }) =>
      apiFetch<{ rule: PlaybookRule }>(`/api/sites/${siteId}/playbook/rules`, {
        method: 'POST',
        token,
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      pushToast('Regulă adăugată.', 'success');
      qc.invalidateQueries({ queryKey: ['playbook', siteId] });
    },
  });
}

export function useUpdateRule(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; active?: boolean; rule?: string }) =>
      apiFetch(`/api/playbook/rules/${v.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ active: v.active, rule: v.rule }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playbook', siteId] }),
  });
}

export function useDeleteRule(siteId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/playbook/rules/${id}`, { method: 'DELETE', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playbook', siteId] }),
  });
}
