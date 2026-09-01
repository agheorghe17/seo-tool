'use client';

import Link from 'next/link';
import { usePortfolio } from '@/lib/insights';
import { Badge, Button, Card, EmptyState, ErrorState, Gauge, PageHeading, Skeleton } from '@/components/ui';

export default function SitesPage() {
  const { data: sites, isLoading, error } = usePortfolio();

  const attention = (sites ?? []).filter((s) => s.needsAttention);

  return (
    <div>
      <PageHeading
        title="Site-urile mele"
        subtitle="Optimizare SEO pe pilot automat — scor, sarcini, progres."
        actions={
          <Link href="/sites/new">
            <Button>+ Site nou</Button>
          </Link>
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}
      {error && <ErrorState error={error} />}

      {sites && sites.length === 0 && (
        <EmptyState
          icon="🌱"
          title="Niciun site încă"
          hint="Adaugă primul site, verifică-i proprietatea și pornește scanul."
          action={
            <Link href="/sites/new">
              <Button>+ Site nou</Button>
            </Link>
          }
        />
      )}

      {sites && sites.length > 0 && attention.length > 0 && (
        <Card className="mb-5">
          <div className="text-sm font-medium">Săptămâna asta</div>
          <ul className="mt-1 space-y-1 text-sm text-[var(--text-muted)]">
            {attention.slice(0, 5).map((s) => (
              <li key={s.id}>
                <Link href={`/sites/${s.id}`} className="hover:underline">
                  <strong className="text-[var(--text)]">{s.domain}</strong> — {s.nextAction}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-3">
        {sites?.map((s) => (
          <Link key={s.id} href={`/sites/${s.id}`}>
            <Card className="flex flex-wrap items-center justify-between gap-4 transition hover:border-[var(--border-strong)]">
              <div className="flex items-center gap-4">
                <Gauge score={s.health} size={64} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.domain}</span>
                    {s.needsAttention && <Badge tone="warning">necesită atenție</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Vizibilitate AI: {s.aiVisibility ?? '—'} · {s.openTasks} de aprobat
                    {s.pendingInterventions > 0 ? ` · ${s.pendingInterventions} în măsurare` : ''}
                    {s.decayPages > 0 ? ` · ${s.decayPages} în declin` : ''}
                  </p>
                </div>
              </div>
              <span className="text-sm text-[var(--text-muted)]">{s.nextAction} →</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
