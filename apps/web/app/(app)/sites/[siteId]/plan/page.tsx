'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useActionPlan, type PlanAction, type PlanPhase } from '@/lib/insights';
import { useRebuildStrategy } from '@/lib/strategy';
import { markPipelineStart } from '@/components/PipelineStrip';
import { pushToast } from '@/lib/toast';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';

const fmt = (n: number) => Math.round(n).toLocaleString('ro-RO');

const PHASE_LABEL: Record<number, string> = { 30: 'Primele 30 de zile', 60: 'Zilele 30–60', 90: 'Zilele 60–90' };

const STATUS: Record<string, { label: string; tone: 'good' | 'warning' | 'neutral' }> = {
  done: { label: 'gata', tone: 'good' },
  applied: { label: 'aplicat', tone: 'good' },
  doing: { label: 'în lucru', tone: 'warning' },
  approved: { label: 'aprobat', tone: 'warning' },
  todo: { label: 'de făcut', tone: 'neutral' },
  draft: { label: 'de făcut', tone: 'neutral' },
};

export default function PlanPage() {
  const siteId = useParams().siteId as string;
  const { data, isLoading, error } = useActionPlan(siteId);
  const rebuild = useRebuildStrategy(siteId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState error={error} />;

  const hasActions = !!data && data.phases.some((p) => p.actions.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plan 30 / 60 / 90</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Planul concret, pas cu pas, cu cât trafic ar putea aduce fiecare acțiune și în total.
          </p>
        </div>
        <Button
          variant="ghost"
          loading={rebuild.isPending}
          onClick={() =>
            rebuild.mutate(undefined, {
              onSuccess: () => {
                markPipelineStart(siteId);
                pushToast('Se reface planul în fundal.', 'success');
              },
            })
          }
        >
          Reface planul
        </Button>
      </div>

      {!hasActions ? (
        <EmptyState
          icon="🗺️"
          title="Planul nu e gata încă"
          hint={'Se generează după strategie. Apasă „Reface planul" și revino în câteva minute.'}
        />
      ) : (
        <>
          <SummaryCard data={data!} />
          {data!.phases
            .filter((p) => p.actions.length > 0)
            .map((p) => (
              <PhaseBlock key={p.days} phase={p} siteId={siteId} />
            ))}
          <p className="text-xs text-[var(--text-faint)]">
            Cum se citește: „+X–Y/lună” e traficul organic suplimentar față de acum, dacă pagina
            ajunge pe poziția țintă. Interval, nu o promisiune. În lunile 1–2 mișcarea e mică
            (Google reindexează), creșterea vine gradual după.
          </p>
        </>
      )}
    </div>
  );
}

function SummaryCard({ data }: { data: ReturnType<typeof useActionPlan>['data'] & object }) {
  const last = data.phases[data.phases.length - 1];
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-[var(--text-muted)]">Acum</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums">
            {data.baselineSource === 'gsc'
              ? `~${fmt(data.baselineMonthlyVisits)} vizite/lună`
              : 'estimare din volume'}
          </div>
          {data.baselineSource !== 'gsc' && (
            <div className="text-xs text-[var(--text-faint)]">
              conectează Search Console pentru cifre reale
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">Dacă aplici tot planul (~90 zile)</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--good)]">
            +{fmt(data.totals.clicksLow)}–{fmt(data.totals.clicksHigh)}/lună
          </div>
          <div className="text-xs text-[var(--text-faint)]">
            {data.totals.done}/{data.totals.actions} acțiuni făcute
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">Încredere</div>
          <div className="mt-0.5 text-lg font-semibold">
            {data.confidence === 'high' ? 'mare' : data.confidence === 'medium' ? 'medie' : 'scăzută'}
          </div>
          <div className="text-xs text-[var(--text-faint)]">interval, nu o promisiune</div>
        </div>
      </div>
      {last && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
          {data.phases
            .filter((p) => p.actions.length > 0)
            .map((p) => (
              <span key={p.days}>
                <strong className="text-[var(--text)]">La {p.days} zile:</strong> +
                {fmt(p.cumulativeClicksLow)}–{fmt(p.cumulativeClicksHigh)}/lună
              </span>
            ))}
        </div>
      )}
    </Card>
  );
}

function PhaseBlock({ phase, siteId }: { phase: PlanPhase; siteId: string }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {PHASE_LABEL[phase.days] ?? `${phase.days} zile`}{' '}
          <span className="font-normal text-[var(--text-muted)]">
            · {phase.actions.length} {phase.actions.length === 1 ? 'acțiune' : 'acțiuni'}
          </span>
        </h2>
        <span className="text-xs tabular-nums text-[var(--good)]">
          +{fmt(phase.addClicksLow)}–{fmt(phase.addClicksHigh)}/lună din pașii ăștia
        </span>
      </div>
      <div className="mt-3 divide-y divide-[var(--border)]">
        {phase.actions.map((a) => (
          <ActionRow key={a.id} action={a} siteId={siteId} />
        ))}
      </div>
    </Card>
  );
}

function ActionRow({ action: a, siteId }: { action: PlanAction; siteId: string }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[a.status] ?? STATUS.todo!;
  const href =
    a.kind === 'blueprint' ? `/sites/${siteId}/pages-plan` : `/sites/${siteId}/tasks`;
  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="truncate font-medium">{a.title}</span>
            <Badge tone={s.tone}>{s.label}</Badge>
          </div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
            {a.currentPosition != null
              ? `poziția ~${Math.round(a.currentPosition)}`
              : 'nerankată încă'}
            {a.targetPosLow != null && ` → țintă ${a.targetPosLow}–${a.targetPosHigh}`}
            {a.why && (
              <>
                {' · '}
                <button className="underline" onClick={() => setOpen((v) => !v)}>
                  {open ? 'ascunde' : 'de ce'}
                </button>
              </>
            )}
          </div>
          {open && a.why && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">{a.why}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-[var(--good)]">
            {a.qualitative ? '—' : `+${fmt(a.addClicksLow)}–${fmt(a.addClicksHigh)}`}
          </div>
          <div className="text-xs text-[var(--text-faint)]">
            {a.qualitative ? 'fără volum' : 'vizite/lună'}
          </div>
          <Link href={href} className="text-xs text-[var(--accent-text)] underline">
            deschide
          </Link>
        </div>
      </div>
    </div>
  );
}
