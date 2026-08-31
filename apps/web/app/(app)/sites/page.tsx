'use client';

import Link from 'next/link';
import { useSites } from '@/lib/queries';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeading, Skeleton, scoreTone } from '@/components/ui';

export default function SitesPage() {
  const { data: sites, isLoading, error } = useSites();

  return (
    <div>
      <PageHeading
        title="Site-urile mele"
        subtitle="Scanează pagină-cu-pagină și urmărește scorul SEO."
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
          title="Niciun site încă"
          hint="Adaugă primul site și verifică-i proprietatea ca să pornești un crawl."
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
            <Card className="flex items-center justify-between transition hover:border-neutral-400">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.domain}</span>
                  <Badge tone={s.verified ? 'good' : 'neutral'}>
                    {s.verified ? 'verificat' : 'neverificat'}
                  </Badge>
                  {s.connectionType === 'wordpress' && <Badge tone="info">WordPress</Badge>}
                  {s.gscConnected && <Badge tone="good">GSC</Badge>}
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {s.lastCrawl
                    ? `Ultimul crawl: ${s.lastCrawl.status} · ${s.lastCrawl.pagesScanned} pagini`
                    : 'Niciun crawl încă'}
                </p>
              </div>
              {s.lastCrawl?.status === 'completed' && (
                <Badge tone={scoreTone(null)}>vezi raport →</Badge>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
