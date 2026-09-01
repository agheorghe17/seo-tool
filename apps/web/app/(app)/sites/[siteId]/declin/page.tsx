'use client';

import { useParams } from 'next/navigation';
import { useDecay } from '@/lib/insights';
import { AnalysisNav } from '@/components/AnalysisNav';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';

export default function DecayPage() {
  const siteId = useParams().siteId as string;
  const { data, isLoading, error } = useDecay(siteId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analiză</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Pagini care rankau și pierd teren — cel mai bun ROI e să le împrospătezi, nu să scrii altele.
        </p>
        <AnalysisNav siteId={siteId} active="declin" />
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {error && <ErrorState error={error} />}

      {data && !data.gscConnected && (
        <Card>
          <p className="text-sm text-[var(--warn)]">
            Conectează Google Search Console în Setări — radarul de declin are nevoie de istoricul de
            trafic.
          </p>
        </Card>
      )}

      {data && data.gscConnected && !data.hasHistory && (
        <EmptyState
          icon="📉"
          title="Încă se strânge istoricul"
          hint="Am cerut ultimele 12 luni din Search Console. Revino după următorul refresh săptămânal."
        />
      )}

      {data && data.findings.length === 0 && data.hasHistory && (
        <EmptyState icon="✅" title="Nicio pagină în declin" hint="Traficul pe pagini e stabil sau în creștere." />
      )}

      {data && data.findings.length > 0 && (
        <div className="space-y-2">
          {data.findings.map((f) => (
            <Card key={f.url} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{safePath(f.url)}</span>
                <Badge tone="critical">
                  {f.reason === 'ranking_loss' ? 'poziție pierdută' : `-${Math.round(f.clicksDropPct * 100)}% clicuri`}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Vârf: {f.peakClicks} clicuri în {f.peakMonth} → acum {f.currentClicks}. Scade de{' '}
                {f.monthsDeclining} luni.
                {f.positionDrift != null && f.positionDrift > 0
                  ? ` Poziția s-a înrăutățit cu ~${f.positionDrift}.`
                  : ''}
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                <strong>De făcut:</strong> actualizează cifrele și exemplele, adaugă secțiunile pe care
                le acoperă acum rezultatele din top, verifică că răspunsul principal e în primul
                paragraf, actualizează data.
              </p>
            </Card>
          ))}
        </div>
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
