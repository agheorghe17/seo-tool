'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from '@/components/AuthProvider';

export interface HomeTask {
  id: string;
  kind: 'fix' | 'keyword' | 'roadmap';
  category: string;
  title: string;
  why: string | null;
  impact: number;
  effort: number;
  status: 'todo' | 'doing' | 'done';
  count?: number;
  autoFixable?: boolean;
  pageId?: string | null;
  keywordId?: string | null;
  position?: number | null;
  phase?: number;
  bucket?: string;
}

export interface Signal {
  type:
    | 'rank_up'
    | 'rank_down'
    | 'refresh_needed'
    | 'competitor_move'
    | 'answer_gap'
    | 'content_ready';
  tone: 'good' | 'bad' | 'neutral';
  text: string;
  href: string;
}

type ScorePoint = { crawlId: string; at: string; total: number | null };

export interface HomeData {
  site: {
    domain: string;
    connectionType: 'wordpress' | 'universal';
    verified: boolean;
    wpConnected: boolean;
    gscConnected: boolean;
    hasSecrets: string[];
  };
  score: {
    total: number | null;
    delta: number | null;
    history: ScorePoint[];
    categories: Record<string, number | null>;
  };
  aiVisibility: {
    score: number | null;
    delta: number | null;
    history: ScorePoint[];
  };
  crawl: { id: string; status: string; pagesScanned: number; at: string } | null;
  gamification: {
    points: number;
    appliedFixes: number;
    doneRoadmap: number;
    streakWeeks: number;
  };
  tasks: {
    open: number;
    done: number;
    quickWins: number;
    focus: HomeTask | null;
    next: HomeTask[];
  };
  keywords: { total: number; ranking: number; top10: number; striking: number };
  traffic: {
    low: number;
    mid: number;
    high: number;
    horizonMonths: number;
    confidence: 'low' | 'medium' | 'high';
    baselineSource: 'gsc' | 'keyword_model';
    assumptions: string[];
    baselineMonthlyVisits: number;
    phases: { days: number; low: number; mid: number; high: number }[];
    backtest?: {
      projectedLow: number;
      projectedHigh: number;
      actual: number;
      withinBand: boolean;
      agoDays: number;
    } | null;
  } | null;
  signals: Signal[];
  strategyReady: boolean;
}

function useToken() {
  return useAuth().token;
}

export function useHome(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['home', siteId],
    queryFn: () =>
      apiFetch<{ home: HomeData }>(`/api/sites/${siteId}/home`, { token }).then((r) => r.home),
    enabled: !!token,
    refetchInterval: 15000,
  });
}

export function useSignals(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['signals', siteId],
    queryFn: () =>
      apiFetch<{ signals: Signal[] }>(`/api/sites/${siteId}/signals`, { token }).then(
        (r) => r.signals,
      ),
    enabled: !!token,
  });
}

export interface PipelineStep {
  type: string;
  status: 'running' | 'ok' | 'failed';
  error: string | null;
  at: string;
}

export function usePipeline(siteId: string, poll = false) {
  const token = useToken();
  return useQuery({
    queryKey: ['pipeline', siteId],
    queryFn: () =>
      apiFetch<{ steps: PipelineStep[]; running: boolean }>(`/api/sites/${siteId}/pipeline`, {
        token,
      }),
    enabled: !!token,
    refetchInterval: poll ? 3000 : false,
  });
}

export function useTasks(siteId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['tasks', siteId],
    queryFn: () =>
      apiFetch<{ tasks: HomeTask[]; counts: { open: number; done: number } }>(
        `/api/sites/${siteId}/tasks`,
        { token },
      ),
    enabled: !!token,
  });
}
