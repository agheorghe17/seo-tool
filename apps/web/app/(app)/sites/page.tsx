'use client';

import Link from 'next/link';
import { useSites } from '@/lib/queries';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeading, Skeleton } from '@/components/ui';

export default function SitesPage() {
  const { data: sites, isLoading, error } = useSites();

  return (
    <div>
      <PageHeading
        title="Site-urile mele"
        subtitle="Optimizare SEO pe pilot automat — scor, sarcini în limbaj simplu, progres."
        actions={
          <Link href="/sites/new">
            <Button>+ Site nou</Button>
          </Link>
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}
      {error && <ErrorState error={error} />}
      {sites && sites.length === 0 && (
        <EmptyState
          icon="🌱"
          title="Niciun site încă"
          hint="Adaugă primul site, verifică-i proprietatea și pornește scanul. În câteva minute ai un plan."
          action={
            <Link href="/sites/new">
              <Button>+ Site nou</Button>
            </Link>
          }
        />
      )}

      <div className="space-y-3">
        {sites?.map((s) => (
          <Link key={s.id} href={`/sites/${s.id}`}>
            <Card className="flex items-center justify-between transition hover:border-[var(--border-strong)]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.domain}</span>
                  <Badge tone={s.verified ? 'good' : 'neutral'}>
                    {s.verified ? 'verificat' : 'neverificat'}
                  </Badge>
                  {s.connectionType === 'wordpress' && <Badge tone="info">WordPress</Badge>}
                  {s.gscConnected && <Badge tone="good">GSC</Badge>}
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {s.lastCrawl
                    ? `Ultimul scan: ${s.lastCrawl.status} · ${s.lastCrawl.pagesScanned} pagini`
                    : 'Niciun scan încă'}
                </p>
              </div>
              <span className="text-[var(--text-faint)]">→</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
