'use client';

import { useParams } from 'next/navigation';
import { useArchitecture } from '@/lib/insights';
import { AnalysisNav } from '@/components/AnalysisNav';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';

function safePath(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

export default function ArchitecturePage() {
  const siteId = useParams().siteId as string;
  const { data: arch, isLoading, error } = useArchitecture(siteId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analiză</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Cum ar trebui organizat site-ul: pagini pilon și pagini de suport.
        </p>
        <AnalysisNav siteId={siteId} active="structura" />
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {error && <ErrorState error={error} />}

      {arch && arch.pillars.length === 0 && arch.orphanClusters.length === 0 && (
        <EmptyState
          icon="🧭"
          title="Nu avem încă suficiente date"
          hint="Reface strategia din Autopilot ca să generăm universul de cuvinte cheie."
        />
      )}

      {arch && (arch.pillars.length > 0 || arch.orphanClusters.length > 0) && (
        <>
          <Card>
            <div className="text-sm">
              Îți trebuie <strong>{arch.coverage.pillarsNeeded}</strong> pagini pilon. Ai{' '}
              <strong>{arch.coverage.pillarsHave}</strong>.
            </div>
          </Card>

          {arch.pillars.map((p) => (
            <Card key={p.clusterId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">🏛️ {p.cluster}</span>
                {p.haveUrl ? (
                  <Badge tone="good">ai pagina: {safePath(p.haveUrl)}</Badge>
                ) : (
                  <Badge tone="critical">lipsește pagina pilon</Badge>
                )}
              </div>
              <ul className="mt-2 space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                {p.children.map((c, i) => (
                  <li key={i} className="list-disc">
                    {c.keyword}{' '}
                    {c.haveUrl ? (
                      <span className="text-[var(--good)]">✓ {safePath(c.haveUrl)}</span>
                    ) : (
                      <span className="text-[var(--text-faint)]">— fără pagină</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          {arch.orphanClusters.length > 0 && (
            <Card>
              <div className="text-sm font-medium">Grupuri fără nicio pagină (oportunități noi)</div>
              <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                {arch.orphanClusters.map((o) => (
                  <li key={o.clusterId}>
                    <Badge tone="warning">
                      {o.cluster} ({o.memberCount})
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {arch.merges.length > 0 && (
            <Card>
              <div className="text-sm font-medium">Grupuri care s-ar putea uni</div>
              <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                {arch.merges.map((m, i) => (
                  <li key={i}>
                    „{m.a}” + „{m.b}”
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
