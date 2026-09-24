'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from '@/components/AuthProvider';

export interface RankedKeyword {
  phrase: string;
  occurrences: number;
  score: number;
  foundIn: { h1: boolean; h2: boolean; title: boolean; url: boolean; intro: boolean; body: boolean };
  searchVolume: number | null;
}

export type LengthStatus = 'missing' | 'short' | 'ok' | 'long';

export interface MetaAudit {
  title: { text: string | null; length: number; lengthStatus: LengthStatus; hasPrimaryKeyword: boolean; keywordNearStart: boolean };
  metaDescription: { text: string | null; length: number; lengthStatus: LengthStatus; hasPrimaryKeyword: boolean };
  h1: { text: string | null; hasPrimaryKeyword: boolean };
  altTexts: { totalImages: number; missingAlt: number; withPrimaryKeyword: number; stuffingRisk: boolean };
}

export interface OnPageAnalysis {
  headingTree: { level: number; text: string }[];
  keywords: RankedKeyword[];
  primaryKeyword: string | null;
  meta: MetaAudit;
}

function useToken() {
  return useAuth().token;
}

export function useOnPageKeywords(pageId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['page-keywords', pageId],
    queryFn: () =>
      apiFetch<{ analysis: OnPageAnalysis }>(`/api/pages/${pageId}/keywords`, { token }).then(
        (r) => r.analysis,
      ),
    enabled: !!token,
  });
}
