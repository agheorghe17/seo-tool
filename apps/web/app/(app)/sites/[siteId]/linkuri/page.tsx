'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useInternalLinks, useMarkLinkDone } from '@/lib/insights';
import { AnalysisNav } from '@/components/AnalysisNav';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';

const REASON: Record<string, string> = {
  mention_no_link: 'menționezi, dar nu linkezi',
  cluster_gap: 'pagini din același grup nu se leagă',
  underlinked: 'pagină importantă cu puține linkuri',
};

function safePath(url: string) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

export default function InternalLinksPage() {
  const siteId = useParams().siteId as string;
  const { data, isLoading, error } = useInternalLinks(siteId);
  const markDone = useMarkLinkDone(siteId);
  const [done, setDone] = useState<Set<string>>(new Set());

  const audit = data?.audit;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analiză</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Unde să adaugi linkuri interne ca să-ți întărești paginile importante.
        </p>
        <AnalysisNav siteId={siteId} active="linkuri" />
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {error && <ErrorState error={error} />}
      {data && !audit && (
        <EmptyState icon="🔗" title="Niciun crawl complet încă" hint="Scanează site-ul din Autopilot." />
      )}

      {audit && (
        <>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <Card className="py-3">
              <div className="text-xl font-semibold">{audit.orphans.length}</div>
              <div className="text-xs text-[var(--text-muted)]">pagini orfane</div>
            </Card>
            <Card className="py-3">
              <div className="text-xl font-semibold">{audit.anchorOpportunities.length}</div>
              <div className="text-xs text-[var(--text-muted)]">menționezi fără link</div>
            </Card>
            <Card className="py-3">
              <div className="text-xl font-semibold">{audit.plan.length}</div>
              <div className="text-xs text-[var(--text-muted)]">acțiuni în plan</div>
            </Card>
          </div>

          {audit.plan.length === 0 ? (
            <EmptyState icon="✅" title="Linking intern arată bine" />
          ) : (
            <div className="space-y-2">
              {audit.plan.map((item, i) => {
                const key = `${item.fromUrl}->${item.toUrl}`;
                const isDone = done.has(key);
                return (
                  <Card key={i} className={`py-3 ${isDone ? 'opacity-50' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 text-sm">
                        Adaugă link din <strong>{safePath(item.fromUrl)}</strong> spre{' '}
                        <strong>{safePath(item.toUrl)}</strong>
                        <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                          ancoră sugerată: „{item.anchor}” · <Badge tone="neutral">{REASON[item.reason] ?? item.reason}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigator.clipboard?.writeText(`[${item.anchor}](${item.toUrl})`)}
                        >
                          Copiază
                        </Button>
                        <Button
                          size="sm"
                          loading={markDone.isPending}
                          disabled={isDone}
                          onClick={() =>
                            markDone.mutate(
                              { fromUrl: item.fromUrl, toUrl: item.toUrl, anchor: item.anchor },
                              { onSuccess: () => setDone((d) => new Set(d).add(key)) },
                            )
                          }
                        >
                          {isDone ? 'Făcut' : 'Am adăugat'}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {audit.orphans.length > 0 && (
            <Card>
              <div className="text-sm font-medium">Pagini fără niciun link intern spre ele</div>
              <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                {audit.orphans.slice(0, 15).map((u) => (
                  <li key={u}>{safePath(u)}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
