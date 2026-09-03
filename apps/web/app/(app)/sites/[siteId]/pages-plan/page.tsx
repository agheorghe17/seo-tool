'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { AnalysisNav } from '@/components/AnalysisNav';
import {
  useApplyBlueprint,
  useBlueprintPrompt,
  useDismissBlueprint,
  usePlan,
  useRebuildPlan,
  useRollbackBlueprint,
  type Blueprint,
  type PlanProjection,
} from '@/lib/plan';
import { useSite } from '@/lib/queries';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';

const DIAG: Record<Blueprint['diagnosis'], { label: string; tone: 'good' | 'warning' | 'critical' | 'neutral' }> = {
  ok: { label: 'ok', tone: 'good' },
  cannibalization: { label: 'canibalizare', tone: 'warning' },
  orphan_page: { label: 'fără legătură', tone: 'critical' },
  no_target: { label: 'fără cuvânt țintă', tone: 'critical' },
};

export default function PagesPlanPage() {
  const siteId = useParams().siteId as string;
  const { data, isLoading, error } = usePlan(siteId);
  const { data: site } = useSite(siteId);
  const rebuild = useRebuildPlan(siteId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState error={error} />;

  const blueprints = (data?.blueprints ?? []).filter((b) => b.status !== 'dismissed');
  const problems = blueprints.filter((b) => b.diagnosis !== 'ok').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analiză</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Ce cuvânt ar trebui să țintească fiecare pagină și cum s-o refaci.
          </p>
          <AnalysisNav siteId={siteId} active="pages-plan" />
        </div>
        <Button variant="ghost" loading={rebuild.isPending} onClick={() => rebuild.mutate()}>
          Reface planul
        </Button>
      </div>

      {data && data.cannibalizationGroups && data.cannibalizationGroups.length > 0 && (
        <Card>
          <div className="text-sm font-medium">Canibalizare — pagini care se concurează</div>
          <div className="mt-2 space-y-3">
            {data.cannibalizationGroups.map((g, i) => (
              <div key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3 text-sm">
                <div>
                  Pentru „{g.keyword}” păstrează <strong>{pathOf(g.canonicalUrl)}</strong>.
                </div>
                <ul className="mt-1 list-disc pl-5 text-xs text-[var(--text-muted)]">
                  {g.mergeInstructions.map((m, j) => (
                    <li key={j}>{m}</li>
                  ))}
                </ul>
                <button
                  className="mt-2 text-xs text-[var(--accent-text)] underline"
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      g.redirects.map((r) => `${r.from}  ->  ${r.to}  (301)`).join('\n'),
                    )
                  }
                >
                  Copiază lista de redirect-uri 301
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data?.market && (data.market.primaryCity || data.market.geoCountry) && (
        <p className="text-xs text-[var(--text-faint)]">
          Piață: {data.market.geoCountry ?? '—'}
          {data.market.primaryCity ? ` · accent pe ${data.market.primaryCity}` : ''}
          {data.market.localEmphasis ? ' · local' : ''} — se schimbă din Setări.
        </p>
      )}

      <PhaseProjection projection={data?.projection ?? null} blueprints={blueprints} />

      {blueprints.length === 0 ? (
        <EmptyState
          icon="🧭"
          title="Niciun blueprint încă"
          hint={'Planul pe pagini se generează după strategie. Apasă „Reface planul” sau reface strategia din Autopilot.'}
        />
      ) : (
        <>
          {problems > 0 && (
            <p className="text-sm text-[var(--text-muted)]">
              {problems} {problems === 1 ? 'pagină are' : 'pagini au'} o problemă de structură (fără
              cuvânt țintă / canibalizare). Sunt primele în listă.
            </p>
          )}
          <div className="space-y-3">
            {blueprints.map((b) => (
              <BlueprintCard key={b.id} siteId={siteId} bp={b} wpConnected={!!site?.wpSiteUrl} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function pathOf(url: string) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

const PHASE_LABEL: Record<number, string> = {
  30: 'La 30 de zile',
  60: 'La 60 de zile',
  90: 'La 90 de zile',
  180: 'La 6 luni',
};

function PhaseProjection({
  projection,
  blueprints,
}: {
  projection: PlanProjection | null;
  blueprints: Blueprint[];
}) {
  const [showAssumptions, setShowAssumptions] = useState(false);
  const fmt = (n: number) => n.toLocaleString('ro-RO');

  const usable =
    projection &&
    projection.phases.length > 0 &&
    projection.phases[projection.phases.length - 1]!.high - projection.phases[0]!.low >= 3;

  // Bottom-up fallback: when the current organic baseline is too small for a
  // percentage projection, sum the per-page potentials directly.
  const bottomUp = blueprints.reduce(
    (acc, b) => {
      const p = b.potential;
      if (!p || p.qualitative) return acc;
      acc.low += Math.max(0, p.clicksLow - (p.currentClicks ?? 0));
      acc.mid += Math.max(0, p.clicksMid - (p.currentClicks ?? 0));
      acc.high += Math.max(0, p.clicksHigh - (p.currentClicks ?? 0));
      acc.pages += 1;
      return acc;
    },
    { low: 0, mid: 0, high: 0, pages: 0 },
  );

  return (
    <Card>
      <div className="text-sm font-medium">Unde poți ajunge dacă aplici planul</div>
      {!usable ? (
        bottomUp.high >= 3 ? (
          <>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Traficul organic de acum e prea mic pentru o proiecție în timp. Estimarea de mai jos e
              suma potențialului paginilor din plan, dacă ajung pe pozițiile țintă — interval, nu o
              promisiune.
            </p>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 text-[var(--text-muted)]">
                {bottomUp.pages} {bottomUp.pages === 1 ? 'pagină' : 'pagini'}
              </span>
              <div className="relative h-6 flex-1 rounded bg-[var(--surface-2)]">
                <div
                  className="absolute inset-y-0 rounded bg-[var(--accent)]/25"
                  style={{ left: '0%', width: '100%' }}
                />
                <div
                  className="absolute inset-y-0 w-0.5 bg-[var(--accent)]"
                  style={{
                    left: `${bottomUp.high ? (bottomUp.mid / bottomUp.high) * 100 : 50}%`,
                  }}
                />
              </div>
              <span className="w-36 shrink-0 text-right tabular-nums">
                +{fmt(bottomUp.low)}–{fmt(bottomUp.high)}{' '}
                <span className="text-[var(--text-faint)]">/lună</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--text-faint)]">
              Se traduce în timp după ce prinzi primele poziții: lunile 1–2 mișcare mică
              (re-indexare), apoi creștere graduală.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Se calculează după ce reface strategia cu cuvinte care au volum de căutare.
          </p>
        )
      ) : (
        <>
          <div className="mt-1 mb-3 flex items-baseline justify-between text-xs text-[var(--text-muted)]">
            <span>
              {projection!.baselineSource === 'gsc'
                ? `Acum: ~${fmt(projection!.baselineMonthlyVisits)} vizite/lună`
                : 'Estimare din volume de căutare (fără Search Console conectat)'}
            </span>
            <span>
              Încredere:{' '}
              {projection!.confidence === 'high'
                ? 'mare'
                : projection!.confidence === 'medium'
                  ? 'medie'
                  : 'scăzută'}{' '}
              · interval, nu o promisiune
            </span>
          </div>
          <div className="space-y-2">
            {(() => {
              const max = Math.max(...projection!.phases.map((p) => p.high));
              return projection!.phases.map((p) => (
                <div key={p.days} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-[var(--text-muted)]">
                    {PHASE_LABEL[p.days] ?? `${p.days} zile`}
                  </span>
                  <div className="relative h-6 flex-1 rounded bg-[var(--surface-2)]">
                    <div
                      className="absolute inset-y-0 rounded bg-[var(--accent)]/25"
                      style={{
                        left: `${(p.low / max) * 100}%`,
                        width: `${((p.high - p.low) / max) * 100}%`,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 w-0.5 bg-[var(--accent)]"
                      style={{ left: `${(p.mid / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-32 shrink-0 text-right tabular-nums">
                    {fmt(p.low)}–{fmt(p.high)} <span className="text-[var(--text-faint)]">/lună</span>
                  </span>
                </div>
              ));
            })()}
          </div>
          {projection!.assumptions.length > 0 && (
            <>
              <button
                onClick={() => setShowAssumptions((v) => !v)}
                className="mt-3 text-xs text-[var(--text-muted)] underline"
              >
                {showAssumptions ? 'ascunde ipotezele' : 'pe ce se bazează?'}
              </button>
              {showAssumptions && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--text-muted)]">
                  {projection!.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}

function BlueprintCard({
  siteId,
  bp,
  wpConnected,
}: {
  siteId: string;
  bp: Blueprint;
  wpConnected: boolean;
}) {
  const [open, setOpen] = useState(bp.isHomepage || bp.diagnosis !== 'ok');
  const apply = useApplyBlueprint(siteId);
  const rollback = useRollbackBlueprint(siteId);
  const dismiss = useDismissBlueprint(siteId);
  const promptM = useBlueprintPrompt(siteId);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const d = DIAG[bp.diagnosis];
  const rec = bp.recommended;
  const cur = bp.current;
  const pot = bp.potential;

  async function getPrompt() {
    const p = await promptM.mutateAsync(bp.id);
    setPrompt(p);
    try {
      await navigator.clipboard.writeText(p);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* shown below */
    }
  }

  return (
    <Card>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {bp.isHomepage && <Badge tone="info">homepage</Badge>}
            <span className="font-medium">{pathOf(bp.url)}</span>
            {bp.diagnosis !== 'ok' && <Badge tone={d.tone}>{d.label}</Badge>}
            {bp.status === 'applied' && <Badge tone="good">aplicat</Badge>}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            țintă: <strong>{bp.targetKeyword ?? '—'}</strong>
            {cur?.position != null ? ` · acum poziția ${Math.round(cur.position)}` : ''}
          </div>
        </div>
        <span className="text-[var(--text-faint)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4 text-sm animate-slide-up">
          {bp.rationale && <p className="text-[var(--text-muted)]">{bp.rationale}</p>}

          {rec && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title acum" value={cur?.title ?? '—'} />
              <Field label="Title recomandat" value={rec.title} good />
              <Field label="H1 acum" value={cur?.h1 ?? '—'} />
              <Field label="H1 recomandat" value={rec.h1} good />
              <Field
                label="Meta description acum"
                value={cur ? `${cur.metaLen} caractere` : '—'}
              />
              <Field label="Meta recomandat" value={rec.metaDescription} good />
              <Field
                label="Cuvinte acum"
                value={cur ? String(cur.wordCount) : '—'}
              />
              <Field label="Cuvinte țintă" value={`~${rec.wordCountTarget}`} good />
              <Field
                label="Schema acum"
                value={cur?.schemaTypes.join(', ') || 'niciuna'}
              />
              <Field label="Schema recomandată" value={rec.schemaType} good />
            </div>
          )}

          {rec && rec.h2Outline.length > 0 && (
            <div>
              <div className="text-xs font-medium text-[var(--text-muted)]">Secțiuni recomandate (H2)</div>
              <ul className="mt-1 list-disc pl-5 text-[var(--text-muted)]">
                {rec.h2Outline.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          {rec && rec.internalLinksOut.length > 0 && (
            <div className="text-xs text-[var(--text-muted)]">
              Linkuri interne relevante: {rec.internalLinksOut.map(pathOf).join(', ')}
            </div>
          )}

          {pot && (
            <div className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-3">
              <div className="text-xs font-medium">Potențial (interval, nu o promisiune)</div>
              <div className="mt-1 text-[var(--text-muted)]">
                Poziție {pot.targetPosLow}–{pot.targetPosHigh}
                {pot.qualitative ? (
                  <> · fără volum de căutare disponibil, deci fără cifră de trafic</>
                ) : (
                  <>
                    {' '}
                    · ~{pot.clicksLow}–{pot.clicksHigh} vizite/lună (acum ~{pot.currentClicks ?? 0})
                    {pot.volumeProxyKeyword && (
                      <span className="text-[var(--text-muted)]">
                        {' '}
                        · volum estimat după „{pot.volumeProxyKeyword}”
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {bp.status === 'applied' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => rollback.mutate(bp.id)}
                disabled={rollback.isPending}
              >
                Anulează (rollback)
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => apply.mutate(bp.id)}
                disabled={apply.isPending || !wpConnected || !rec}
              >
                {apply.isPending ? 'Se aplică…' : 'Aprobă title + meta'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={getPrompt} disabled={promptM.isPending}>
              {copied ? '✓ Prompt copiat' : 'Copiază prompt de rescriere'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(bp.id)}>
              Renunță
            </Button>
          </div>
          {!wpConnected && (
            <p className="text-xs text-[var(--text-faint)]">
              Conectează WordPress în Setări ca să aplici title + meta cu un clic.
            </p>
          )}
          {apply.isError && (
            <p className="text-xs text-[var(--bad)]">{(apply.error as Error).message}</p>
          )}
          {prompt && (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-3 text-xs">
              {prompt}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className={good ? 'font-medium text-[var(--good)]' : ''}>{value}</div>
    </div>
  );
}
