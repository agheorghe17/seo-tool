'use client';

import { useParams } from 'next/navigation';
import { useInterventions } from '@/lib/insights';
import { AnalysisNav } from '@/components/AnalysisNav';
import { Badge, Card, EmptyState, ErrorState, Skeleton, Stat } from '@/components/ui';

const OUTCOME: Record<string, { label: string; tone: 'good' | 'critical' | 'neutral' | 'warning' }> = {
  gain: { label: 'a urcat', tone: 'good' },
  loss: { label: 'a coborât', tone: 'critical' },
  flat: { label: 'fără schimbare', tone: 'neutral' },
  pending: { label: 'în măsurare', tone: 'warning' },
  inconclusive: { label: 'neconcludent', tone: 'neutral' },
};

export default function ResultsPage() {
  const siteId = useParams().siteId as string;
  const { data, isLoading, error } = useInterventions(siteId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analiză</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Fiecare modificare aplicată e urmărită: a mișcat sau nu poziția.
        </p>
        <AnalysisNav siteId={siteId} active="rezultate" />
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {error && <ErrorState error={error} />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Modificări urmărite" value={data.summary.total} />
            <Stat label="Au urcat" value={data.summary.gains} tone="good" />
            <Stat label="Au coborât" value={data.summary.losses} tone="bad" />
            <Stat
              label="Câștig mediu de poziții"
              value={data.summary.avgPositionGain != null ? `+${data.summary.avgPositionGain}` : '—'}
            />
          </div>

          {data.interventions.length === 0 ? (
            <EmptyState
              icon="🧪"
              title="Nicio modificare aplicată încă"
              hint="Aprobă un blueprint, un fix sau bifează un pas din plan — apoi le măsurăm automat după 2 săptămâni."
            />
          ) : (
            <div className="space-y-2">
              {data.interventions.map((iv) => {
                const o = OUTCOME[iv.outcome] ?? OUTCOME.inconclusive;
                return (
                  <Card key={iv.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{iv.label}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {new Date(iv.appliedAt).toLocaleDateString('ro-RO')}
                        {iv.targetUrl ? ` · ${safePath(iv.targetUrl)}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {iv.deltaPosition != null && iv.outcome !== 'pending' && (
                        <span className="tabular-nums text-[var(--text-muted)]">
                          {iv.deltaPosition > 0 ? '▲' : iv.deltaPosition < 0 ? '▼' : '='}{' '}
                          {Math.abs(iv.deltaPosition)} poz.
                        </span>
                      )}
                      <Badge tone={o.tone}>{o.label}</Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function safePath(url: string) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}
