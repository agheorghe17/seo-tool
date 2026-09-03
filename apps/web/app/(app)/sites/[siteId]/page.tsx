'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useHome, type Signal } from '@/lib/home';
import { useAgentNote } from '@/lib/insights';
import { useStartCrawl, useSite } from '@/lib/queries';
import { useRebuildStrategy } from '@/lib/strategy';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Gauge,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { TaskCard } from '@/components/TaskCard';
import { PipelineStrip, markPipelineStart } from '@/components/PipelineStrip';
import { pushToast } from '@/lib/toast';
import type { HomeTask } from '@/lib/home';

function Spark({ points }: { points: (number | null)[] }) {
  const vals = points.filter((p): p is number => p != null);
  if (vals.length < 2) return null;
  const w = 110;
  const h = 30;
  const min = Math.min(...vals) - 2;
  const max = Math.max(...vals) + 2;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => (p == null ? null : `${(i * step).toFixed(1)},${(h - ((p - min) / (max - min || 1)) * h).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  return (
    <svg width={w} height={h}>
      <polyline points={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const SIGNAL_ICON: Record<Signal['type'], string> = {
  rank_up: '📈',
  rank_down: '📉',
  refresh_needed: '✏️',
  competitor_move: '🥊',
  answer_gap: '🤖',
  content_ready: '📄',
};

export default function AutopilotPage() {
  const siteId = useParams().siteId as string;
  const router = useRouter();
  const { data: home, isLoading, error } = useHome(siteId);
  const { data: site } = useSite(siteId);
  const { data: agentNote } = useAgentNote(siteId);
  const startCrawl = useStartCrawl(siteId);
  const rebuild = useRebuildStrategy(siteId);
  const [cmd, setCmd] = useState('');
  const [ack, setAck] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState error={error} />;
  if (!home) return null;

  const crawlRunning = site?.lastCrawl?.status === 'running' || site?.lastCrawl?.status === 'queued';
  const canScan = home.site.verified || home.site.wpConnected;
  const neverScanned = !home.crawl && !crawlRunning;

  function runCommand(text: string) {
    const t = text.toLowerCase();
    setAck(null);
    if (/scan|scanare|scanează|reindex|verific/.test(t)) {
      startCrawl.mutate();
      setAck('Am pornit un scan nou. Se actualizează singur aici.');
    } else if (/strateg|reconstr|reîmprospăt|refa planul|actualizeaz/.test(t)) {
      rebuild.mutate(undefined, { onSuccess: () => markPipelineStart(siteId) });
      setAck('Am pus la lucru: profil → cuvinte cheie → poziții → competitori → plan.');
    } else if (/articol|conținut|scrie|text|blog/.test(t)) {
      router.push(`/sites/${siteId}/content`);
    } else if (/competitor|concuren/.test(t)) {
      router.push(`/sites/${siteId}/competitors`);
    } else if (/cuv[âa]nt|keyword|poziți|rank/.test(t)) {
      router.push(`/sites/${siteId}/keywords`);
    } else {
      setAck(`Am notat: „${text}". Deocamdată pot: porni un scan, reface strategia, sau deschide un articol nou.`);
    }
    setCmd('');
  }

  if (neverScanned) {
    return (
      <EmptyState
        icon="🚀"
        title="Gata de primul scan"
        hint={
          canScan
            ? 'Pornim un scan complet al site-ului. În câteva minute ai două scoruri și o coadă de acțiuni de aprobat.'
            : 'Întâi verifică proprietatea sau conectează WordPress din Setări, apoi pornim scanul.'
        }
        action={
          canScan ? (
            <Button onClick={() => startCrawl.mutate()} disabled={startCrawl.isPending}>
              {startCrawl.isPending ? 'Se pornește…' : 'Pornește scanul'}
            </Button>
          ) : (
            <Link href={`/sites/${siteId}/settings`}>
              <Button>Mergi la Setări</Button>
            </Link>
          )
        }
      />
    );
  }

  const queue = [home.tasks.focus, ...home.tasks.next].filter((t): t is HomeTask => !!t).slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Command box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cmd.trim()) runCommand(cmd.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder={'Spune ce vrei… ex. „scanează din nou” sau „scrie un articol despre facebook ads”'}
          className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm"
        />
        <Button type="submit">Trimite</Button>
      </form>
      {ack && <p className="-mt-4 text-sm text-[var(--text-muted)]">{ack}</p>}

      {/* Two scores */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex items-center gap-5">
          <Gauge score={home.score.total} label="Sănătate" delta={home.score.delta} />
          <div className="min-w-0">
            <div className="text-sm font-medium">Scor de sănătate</div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Cât de curat e site-ul: tehnic, viteză, conținut. Peste 80 = sănătos.
            </p>
            <div className="mt-2">
              <Spark points={home.score.history.map((h) => h.total)} />
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-5">
          <Gauge score={home.aiVisibility.score} label="Vizibilitate AI" delta={home.aiVisibility.delta} />
          <div className="min-w-0">
            <div className="text-sm font-medium">Vizibilitate în AI</div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Cât de pregătit e conținutul pentru AI Overviews și asistenți (schema, răspunsuri clare).
            </p>
            <div className="mt-2">
              <Spark points={home.aiVisibility.history.map((h) => h.total)} />
            </div>
          </div>
        </Card>
      </div>

      {/* What's happening now */}
      <Card>
        <SectionTitle>Ce se întâmplă acum</SectionTitle>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-[var(--text-muted)]">
            {crawlRunning ? (
              <>Scan în curs — {site?.lastCrawl?.pagesScanned ?? 0} pagini analizate…</>
            ) : home.crawl ? (
              <>
                Ultimul scan: {home.crawl.pagesScanned} pagini ·{' '}
                {new Date(home.crawl.at).toLocaleDateString('ro-RO')} · {home.tasks.open} acțiuni de aprobat
              </>
            ) : (
              'Niciun scan încă.'
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              loading={rebuild.isPending}
              onClick={() =>
                rebuild.mutate(undefined, {
                  onSuccess: () => {
                    markPipelineStart(siteId);
                    pushToast('Strategia se reface în fundal.', 'success');
                  },
                })
              }
            >
              Reface strategia
            </Button>
            <Button
              size="sm"
              loading={startCrawl.isPending}
              disabled={crawlRunning}
              onClick={() =>
                startCrawl.mutate(undefined, {
                  onSuccess: () => pushToast('Scan pornit.', 'success'),
                })
              }
            >
              {crawlRunning ? 'Scan în curs…' : 'Scanează din nou'}
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <PipelineStrip siteId={siteId} />
        </div>
      </Card>

      {/* Approval queue */}
      <div>
        <SectionTitle hint={<Link href={`/sites/${siteId}/tasks`}>toate ({home.tasks.open}) →</Link>}>
          De aprobat
        </SectionTitle>
        {queue.length > 0 ? (
          <div className="space-y-3">
            {queue.map((t, i) => (
              <TaskCard
                key={t.id}
                task={t}
                defaultOpen={i === 0}
                emphasis={i === 0}
                actions={<QueueActions siteId={siteId} task={t} />}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="✅"
            title="Coada e goală"
            hint="Ai aprobat tot. Scanează din nou peste câteva zile ca să prinzi ce apare nou."
          />
        )}
      </div>

      {/* AI agent review note */}
      {agentNote && (
        <div>
          <SectionTitle>Nota agentului SEO</SectionTitle>
          <Card>
            <p className="text-sm">{agentNote.summary}</p>
            {agentNote.flags.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {agentNote.flags.map((f, i) => (
                  <li key={i} className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2">
                    <div className="text-xs text-[var(--text-muted)]">{f.target}</div>
                    <div className="mt-0.5">
                      <span className="text-[var(--warn)]">{f.problem}</span> → {f.suggestion}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-[var(--text-faint)]">
              {new Date(agentNote.createdAt).toLocaleDateString('ro-RO')} · a verificat{' '}
              {agentNote.reviewed} elemente · sugestii, nu modificări automate
            </p>
          </Card>
        </div>
      )}

      {/* Live signals */}
      <div>
        <SectionTitle>Semnale</SectionTitle>
        {home.signals.length > 0 ? (
          <Card>
            <ul className="space-y-2 text-sm">
              {home.signals.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden>{SIGNAL_ICON[s.type]}</span>
                  <Link
                    href={`/sites/${siteId}/${s.href}`}
                    className={`hover:underline ${
                      s.tone === 'good'
                        ? 'text-[var(--good)]'
                        : s.tone === 'bad'
                          ? 'text-[var(--bad)]'
                          : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {s.text}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            {home.site.gscConnected
              ? 'Nimic nou de raportat. Revino peste câteva zile.'
              : 'Conectează Google Search Console în Setări ca să urmărim automat mișcările.'}
          </p>
        )}
      </div>

      {/* 30/60/90 traffic projection */}
      <div>
        <SectionTitle hint={<Link href={`/sites/${siteId}/pages-plan`}>vezi planul pe pagini →</Link>}>
          Proiecție de trafic dacă aplici planul
        </SectionTitle>
        <Projection traffic={home.traffic} />
      </div>

      {/* Connection nudges */}
      {(!home.site.gscConnected || !home.site.wpConnected) && (
        <Card>
          <SectionTitle>Pune pilotul automat la treabă</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {!home.site.gscConnected && (
              <Link
                href={`/sites/${siteId}/settings`}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3 text-sm hover:border-[var(--border-strong)]"
              >
                <div className="font-medium">Conectează Google Search Console</div>
                <div className="text-xs text-[var(--text-muted)]">
                  Poziții reale + urcă/coboară automat, săptămânal.
                </div>
              </Link>
            )}
            {!home.site.wpConnected && (
              <Link
                href={`/sites/${siteId}/settings`}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3 text-sm hover:border-[var(--border-strong)]"
              >
                <div className="font-medium">Conectează WordPress</div>
                <div className="text-xs text-[var(--text-muted)]">
                  Ca să aprobi reparațiile și să publici drafturi cu un clic.
                </div>
              </Link>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function QueueActions({ siteId, task }: { siteId: string; task: HomeTask }) {
  if (task.kind === 'fix' && task.pageId) {
    return (
      <Link href={`/pages/${task.pageId}`}>
        <Button size="sm">{task.autoFixable ? 'Aprobă și rezolvă →' : 'Vezi ce e de făcut →'}</Button>
      </Link>
    );
  }
  if (task.kind === 'keyword' && task.keywordId) {
    return (
      <div className="flex gap-2">
        <Link href={`/sites/${siteId}/content`}>
          <Button size="sm">Scrie articolul →</Button>
        </Link>
        <Link href={`/sites/${siteId}/keywords?kw=${task.keywordId}`}>
          <Button size="sm" variant="ghost">
            Vezi planul
          </Button>
        </Link>
      </div>
    );
  }
  return (
    <Link href={`/sites/${siteId}/tasks`}>
      <Button size="sm" variant="ghost">
        Deschide în Aprobări →
      </Button>
    </Link>
  );
}

function Projection({ traffic }: { traffic: import('@/lib/home').HomeData['traffic'] }) {
  const [showAssumptions, setShowAssumptions] = useState(false);
  // Only truly hide when the estimator produced nothing usable.
  const nothing =
    !traffic ||
    traffic.phases.length === 0 ||
    traffic.phases[traffic.phases.length - 1]!.high - traffic.phases[0]!.low < 3;
  if (nothing) {
    return (
      <Card>
        <p className="text-sm text-[var(--text-muted)]">
          Proiecția apare după ce reface strategia (are nevoie de cuvinte cu volum) sau conectezi
          Google Search Console în Setări.
        </p>
      </Card>
    );
  }
  const fmt = (n: number) => n.toLocaleString('ro-RO');
  const label: Record<number, string> = {
    30: 'La 30 de zile',
    60: 'La 60 de zile',
    90: 'La 90 de zile',
    180: 'La 6 luni',
  };
  const max = Math.max(...traffic.phases.map((p) => p.high));
  const bt = traffic.backtest;
  return (
    <Card>
      {bt && (
        <div
          className={`mb-3 rounded-[var(--radius-sm)] border p-2 text-xs ${
            bt.withinBand
              ? 'border-[var(--good)] text-[var(--good)]'
              : 'border-[var(--warn)] text-[var(--warn)]'
          }`}
        >
          Proiecția de acum {bt.agoDays} de zile a estimat {fmt(bt.projectedLow)}–{fmt(bt.projectedHigh)}
          /lună. Real acum: {fmt(bt.actual)}. {bt.withinBand ? '✓ în interval.' : 'în afara intervalului.'}
        </div>
      )}
      <div className="mb-2 flex items-baseline justify-between text-xs text-[var(--text-muted)]">
        <span>
          {traffic.baselineSource === 'gsc'
            ? `Acum: ~${fmt(traffic.baselineMonthlyVisits)} vizite/lună`
            : 'Estimare din volume de căutare (fără Search Console)'}
        </span>
        <span>
          Încredere:{' '}
          {traffic.confidence === 'high'
            ? 'mare'
            : traffic.confidence === 'medium'
              ? 'medie'
              : 'scăzută'}{' '}
          · interval, nu o promisiune
        </span>
      </div>
      {traffic.baselineSource !== 'gsc' && (
        <p className="mb-2 text-xs text-[var(--text-faint)]">
          Conectează Google Search Console în Setări pentru o proiecție mai precisă, bazată pe
          traficul tău real.
        </p>
      )}
      <div className="space-y-2">
        {traffic.phases.map((p) => (
          <div key={p.days} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 text-[var(--text-muted)]">{label[p.days] ?? `${p.days} zile`}</span>
            <div className="relative h-6 flex-1 rounded bg-[var(--surface-2)]">
              <div
                className="absolute inset-y-0 rounded bg-[var(--accent)]/25"
                style={{ left: `${(p.low / max) * 100}%`, width: `${((p.high - p.low) / max) * 100}%` }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-[var(--accent)]"
                style={{ left: `${(p.mid / max) * 100}%` }}
              />
            </div>
            <span className="w-32 shrink-0 text-right tabular-nums">
              {fmt(p.low)}–{fmt(p.high)}
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={() => setShowAssumptions((v) => !v)}
        className="mt-3 text-xs text-[var(--text-muted)] underline"
      >
        {showAssumptions ? 'ascunde ipotezele' : 'pe ce se bazează?'}
      </button>
      {showAssumptions && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--text-muted)]">
          {traffic.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
