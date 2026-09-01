'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useAddCompetitor,
  useCompetitorGap,
  useCompetitors,
  useDeleteCompetitor,
} from '@/lib/strategy';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui';
import { SeoTermTooltip } from '@/components/strategy/SeoTermTooltip';

export default function CompetitorsPage() {
  const siteId = useParams().siteId as string;
  const { data: comps, isLoading } = useCompetitors(siteId);
  const add = useAddCompetitor(siteId);
  const del = useDeleteCompetitor(siteId);
  const [domain, setDomain] = useState('');
  const [openGap, setOpenGap] = useState<string | null>(null);
  const gap = useCompetitorGap(siteId, openGap);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analiză</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Adaugă domenii cu care te compari. Le analizăm{' '}
          <SeoTermTooltip term="content gap">crawlându-le site-ul</SeoTermTooltip> — fără niciun
          serviciu plătit.
        </p>
        <div className="mt-3 flex gap-4 text-sm">
          <Link
            href={`/sites/${siteId}/keywords`}
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Cuvinte cheie
          </Link>
          <span className="font-medium text-[var(--text)]">Competitori</span>
          <Link
            href={`/sites/${siteId}/pages-plan`}
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Pagini
          </Link>
        </div>
      </div>

      <Card>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (domain.trim()) add.mutate(domain.trim(), { onSuccess: () => setDomain('') });
          }}
        >
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="competitor.ro"
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={add.isPending}>
            Adaugă
          </Button>
        </form>
      </Card>

      {isLoading && <Skeleton className="h-24 w-full" />}
      {comps && comps.length === 0 && (
        <EmptyState
          icon="🥊"
          title="Niciun competitor adăugat"
          hint="Adaugă 2–3 site-uri concurente ca să vezi pe ce subiecte sunt mai puternici și ce pagini îți lipsesc."
        />
      )}

      {comps?.map((c) => (
        <Card key={c.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium">{c.domain}</span>
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                {c.pagesCrawled > 0
                  ? `${c.pagesCrawled} pagini analizate`
                  : 'în curs de analiză…'}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpenGap(openGap === c.id ? null : c.id)}
              >
                {openGap === c.id ? 'ascunde' : 'unde te bate'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => del.mutate(c.id)}>
                șterge
              </Button>
            </div>
          </div>

          {openGap === c.id && gap.data && (
            <div className="mt-4 border-t border-[var(--border)] pt-4 text-sm">
              {(() => {
                const rows = gap.data.coverage
                  .filter((r) => r.gap > 0)
                  .sort((a, b) => b.gap - a.gap)
                  .slice(0, 8);
                if (rows.length === 0)
                  return (
                    <p className="text-[var(--text-muted)]">
                      Nu are un avantaj clar de conținut față de tine pe grupurile analizate. 🎉
                    </p>
                  );
                return (
                  <ul className="space-y-2">
                    {rows.map((r) => (
                      <li key={r.cluster} className="flex items-start gap-2">
                        <span aria-hidden>📄</span>
                        <span>
                          La <strong>{r.cluster}</strong> are {r.competitorPages} pagini, tu ai{' '}
                          {r.yourPages}.{' '}
                          <span className="text-[var(--text-muted)]">
                            Creează încă {r.gap} {r.gap === 1 ? 'pagină' : 'pagini'} pe acest subiect.
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              })()}
              {gap.data.examples.length > 0 && (
                <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
                  <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">
                    Exemple de pagini pe care le au ei:
                  </p>
                  <ul className="space-y-1 text-xs text-[var(--text-muted)]">
                    {gap.data.examples.slice(0, 5).map((ex) => (
                      <li key={ex.url}>
                        <Badge tone="neutral">{ex.keyword}</Badge>{' '}
                        <span className="break-all">{ex.url}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
