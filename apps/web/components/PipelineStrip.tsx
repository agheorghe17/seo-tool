'use client';

import { usePipeline, type PipelineStep } from '@/lib/home';
import { Spinner } from './ui';

const LABEL: Record<string, string> = {
  crawl: 'scan',
  'profile-extract': 'profil',
  'keyword-research': 'cuvinte cheie',
  'rank-import': 'poziții',
  'competitor-crawl': 'competitori',
  'strategy-build': 'strategie',
  'page-plan': 'plan pe pagini',
  'traffic-history': 'istoric trafic',
  estimate: 'proiecție',
};

function dot(s: PipelineStep) {
  if (s.status === 'running') return <Spinner className="text-[var(--accent)]" />;
  if (s.status === 'failed') return <span className="text-[var(--bad)]">✕</span>;
  return <span className="text-[var(--good)]">✓</span>;
}

export function PipelineStrip({ siteId }: { siteId: string }) {
  const { data } = usePipeline(siteId, true);
  if (!data || data.steps.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
      {data.running ? <span className="font-medium text-[var(--text)]">Se procesează…</span> : null}
      {data.steps.map((s) => (
        <span key={s.type} className="inline-flex items-center gap-1" title={s.error ?? undefined}>
          {dot(s)} {LABEL[s.type] ?? s.type}
        </span>
      ))}
      {data.steps.some((s) => s.status === 'failed') && (
        <span className="text-[var(--bad)]">
          — {data.steps.find((s) => s.status === 'failed')?.error?.slice(0, 80)}
        </span>
      )}
    </div>
  );
}
