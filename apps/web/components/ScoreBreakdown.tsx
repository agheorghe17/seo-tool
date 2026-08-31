import type { CrawlSummaryDto } from '@/lib/queries';
import { scoreTone } from './ui';

const LABELS: Record<string, string> = {
  technical: 'Tehnic',
  cwv: 'Core Web Vitals',
  onpage: 'On-page',
  content: 'Conținut',
  geo: 'GEO / AI',
};

function Bar({ label, value }: { label: string; value: number | null }) {
  const tone = scoreTone(value);
  const color =
    tone === 'good' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : tone === 'critical' ? 'bg-red-500' : 'bg-neutral-400';
  return (
    <div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>{label}</span>
        <span>{value ?? '—'}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

export function ScoreBreakdown({ summary }: { summary: CrawlSummaryDto }) {
  const total = summary.scores.total;
  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="text-center">
        <div className="text-5xl font-bold tabular-nums">{total ?? '—'}</div>
        <div className="text-xs uppercase tracking-wide text-neutral-500">Scor site</div>
        <div className="mt-1 text-xs text-neutral-500">{summary.pages} pagini</div>
      </div>
      <div className="space-y-3">
        {(['technical', 'cwv', 'onpage', 'content', 'geo'] as const).map((k) => (
          <Bar key={k} label={LABELS[k]!} value={summary.scores[k]} />
        ))}
      </div>
    </div>
  );
}
