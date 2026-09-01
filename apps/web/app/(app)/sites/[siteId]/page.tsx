'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useHome } from '@/lib/home';
import { useStartCrawl, useSite } from '@/lib/queries';
import { useRebuildStrategy } from '@/lib/strategy';
import {
  Button,
  Card,
  CATEGORY_META,
  EmptyState,
  ErrorState,
  Gauge,
  levelFromPoints,
  ProgressBar,
  SectionTitle,
  Skeleton,
  Stat,
} from '@/components/ui';
import { TaskCard } from '@/components/TaskCard';

function Spark({ points }: { points: (number | null)[] }) {
  const vals = points.filter((p): p is number => p != null);
  if (vals.length < 2) return null;
  const w = 120;
  const h = 34;
  const min = Math.min(...vals) - 2;
  const max = Math.max(...vals) + 2;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => {
      if (p == null) return null;
      const x = i * step;
      const y = h - ((p - min) / (max - min || 1)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function SiteHomePage() {
  const siteId = useParams().siteId as string;
  const { data: home, isLoading, error } = useHome(siteId);
  const { data: site } = useSite(siteId);
  const startCrawl = useStartCrawl(siteId);
  const rebuild = useRebuildStrategy(siteId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState error={error} />;
  if (!home) return null;

  const crawlRunning = site?.lastCrawl?.status === 'running' || site?.lastCrawl?.status === 'queued';
  const canScan = home.site.verified || home.site.wpConnected;
  const neverScanned = !home.crawl && !crawlRunning;

  if (neverScanned) {
    return (
      <EmptyState
        icon="🚀"
        title="Gata de primul scan"
        hint={
          canScan
            ? 'Pornim un scan complet al site-ului. În câteva minute vei avea un scor de sănătate și o listă de acțiuni în limbaj simplu.'
            : 'Întâi verifică proprietatea site-ului sau conectează WordPress din Setări, apoi pornim scanul.'
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

  const lvl = levelFromPoints(home.gamification.points);
  const focus = home.tasks.focus;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Acasă</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {crawlRunning
              ? 'Scan în curs — pagina se actualizează singură.'
              : 'Verificarea ta zilnică: unde stai și ce urmează.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => rebuild.mutate()}
            disabled={rebuild.isPending}
          >
            {rebuild.isPending ? 'Se reface…' : 'Reîmprospătează strategia'}
          </Button>
          <Button onClick={() => startCrawl.mutate()} disabled={startCrawl.isPending || crawlRunning}>
            {crawlRunning ? 'Scan în curs…' : startCrawl.isPending ? 'Se pornește…' : 'Scanează din nou'}
          </Button>
        </div>
      </div>

      {/* Hero: score + progress */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex items-center gap-5 md:col-span-1">
          <Gauge score={home.score.total} label="Sănătate" delta={home.score.delta} />
          <div className="min-w-0">
            <div className="text-sm font-medium">Scor de sănătate</div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Media problemelor tehnice, de conținut și de viteză de pe site. Peste 80 = sănătos.
            </p>
            <div className="mt-2">
              <Spark points={home.score.history.map((h) => h.total)} />
            </div>
          </div>
        </Card>

        <Card className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-[var(--text-muted)]">Nivelul tău</div>
              <div className="text-xl font-semibold">
                {lvl.level}. {lvl.name}
              </div>
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <div className="text-xl font-semibold tabular-nums">{home.gamification.streakWeeks}</div>
                <div className="text-[11px] text-[var(--text-muted)]">săpt. la rând 🔥</div>
              </div>
              <div>
                <div className="text-xl font-semibold tabular-nums">{home.gamification.points}</div>
                <div className="text-[11px] text-[var(--text-muted)]">acțiuni ✅</div>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <ProgressBar value={lvl.progress} tone="good" />
            <div className="mt-1 flex justify-between text-[11px] text-[var(--text-muted)]">
              <span>
                {lvl.xpInLevel}/{lvl.xpForLevel} până la nivelul {lvl.level + 1}
              </span>
              <span>
                {home.gamification.appliedFixes} reparate · {home.gamification.doneRoadmap} din plan
              </span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="De făcut" value={home.tasks.open} />
            <Stat label="Câștiguri rapide" value={home.tasks.quickWins} tone="good" />
            <Stat label="Cuvinte în top 10" value={home.keywords.top10} />
          </div>
        </Card>
      </div>

      {/* Do this now */}
      <div>
        <SectionTitle hint={<Link href={`/sites/${siteId}/tasks`}>vezi toate →</Link>}>
          Fă asta acum
        </SectionTitle>
        {focus ? (
          <div className="space-y-3">
            <TaskCard
              task={focus}
              defaultOpen
              emphasis
              actions={<TaskActions siteId={siteId} task={focus} />}
            />
            {home.tasks.next.map((t) => (
              <TaskCard key={t.id} task={t} actions={<TaskActions siteId={siteId} task={t} />} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🎉"
            title="Nicio acțiune deschisă"
            hint="Ai rezolvat tot ce era pe listă. Scanează din nou peste câteva zile ca să prinzi ce apare nou."
          />
        )}
      </div>

      {/* Score breakdown */}
      {home.crawl && (
        <div>
          <SectionTitle
            hint={<Link href={`/crawls/${home.crawl.id}`}>raport complet →</Link>}
          >
            Pe categorii
          </SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(['technical', 'cwv', 'onpage', 'content', 'geo'] as const).map((c) => {
              const v = home.score.categories[c];
              return (
                <div
                  key={c}
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3 text-center"
                >
                  <div className="text-lg" aria-hidden>
                    {CATEGORY_META[c]?.icon}
                  </div>
                  <div className="text-xl font-semibold tabular-nums">{v ?? '—'}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{CATEGORY_META[c]?.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Traffic + changes */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle>Estimare de trafic</SectionTitle>
          {home.traffic && home.traffic.high > 0 ? (
            <>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-semibold tabular-nums">
                  {home.traffic.low.toLocaleString('ro-RO')}–{home.traffic.high.toLocaleString('ro-RO')}
                </span>
                <span className="pb-1 text-xs text-[var(--text-muted)]">
                  vizite/lună în {home.traffic.horizonMonths} luni
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Interval, nu o promisiune. Încredere: {home.traffic.confidence} · bază:{' '}
                {home.traffic.baselineSource === 'gsc' ? 'date reale GSC' : 'model de cuvinte cheie'}.
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              {home.site.gscConnected
                ? 'Prea puține date de trafic momentan. Se completează pe măsură ce Search Console acumulează istoric.'
                : 'Estimarea devine utilă după ce conectezi Google Search Console (Setări).'}
            </p>
          )}
        </Card>

        <Card>
          <SectionTitle>Ce s-a schimbat</SectionTitle>
          {home.changes.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {home.changes.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden>{c.tone === 'good' ? '📈' : c.tone === 'bad' ? '📉' : '•'}</span>
                  <span className="text-[var(--text-muted)]">{c.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              {home.site.gscConnected
                ? 'Încă nu avem două măsurători ca să comparăm. Revino peste o săptămână.'
                : 'Conectează Google Search Console în Setări ca să urmărim automat mișcările de poziție.'}
            </p>
          )}
        </Card>
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
                  Poziții reale, câștiguri rapide și tracking săptămânal automat.
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
                  Ca să aplici reparațiile sigure cu un singur clic.
                </div>
              </Link>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function TaskActions({ siteId, task }: { siteId: string; task: import('@/lib/home').HomeTask }) {
  if (task.kind === 'fix' && task.pageId) {
    return (
      <Link href={`/pages/${task.pageId}`}>
        <Button size="sm" variant={task.autoFixable ? 'primary' : 'ghost'}>
          {task.autoFixable ? 'Rezolvă →' : 'Vezi cum →'}
        </Button>
      </Link>
    );
  }
  if (task.kind === 'keyword' && task.keywordId) {
    return (
      <Link href={`/sites/${siteId}/keywords?kw=${task.keywordId}`}>
        <Button size="sm" variant="ghost">
          Deschide planul →
        </Button>
      </Link>
    );
  }
  if (task.kind === 'roadmap') {
    return (
      <Link href={`/sites/${siteId}/tasks`}>
        <Button size="sm" variant="ghost">
          Bifează în Sarcini →
        </Button>
      </Link>
    );
  }
  return null;
}
