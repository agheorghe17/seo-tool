'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useAddCompetitor,
  useCompetitorGap,
  useCompetitors,
  useDeleteCompetitor,
  useKeywords,
  useOpportunities,
  useProfile,
  useRebuildStrategy,
  useRoadmap,
  useStrategyOverview,
  useUpdateRoadmapItem,
  type KeywordRow,
} from '@/lib/strategy';
import { Badge, Button, Card, EmptyState, PageHeading, Skeleton, scoreTone } from '@/components/ui';
import { ProfileWizard } from '@/components/strategy/ProfileWizard';
import { KeywordDetail } from '@/components/strategy/KeywordDetail';
import { SeoTermTooltip } from '@/components/strategy/SeoTermTooltip';

const TABS = ['Prezentare', 'Cuvinte cheie', 'Oportunități', 'Competitori', 'Plan 30/60/90'] as const;
type Tab = (typeof TABS)[number];

const BUCKET_LABEL: Record<string, string> = {
  quick_win: 'Câștig rapid',
  build_content: 'De creat conținut',
  long_game: 'Termen lung',
};

export default function StrategyPage() {
  const siteId = useParams().siteId as string;
  const overview = useStrategyOverview(siteId);
  const profile = useProfile(siteId);
  const rebuild = useRebuildStrategy(siteId);
  const [tab, setTab] = useState<Tab>('Prezentare');
  const [detailKw, setDetailKw] = useState<string | null>(null);

  const needsWizard = !profile.isLoading && (!profile.data || !profile.data.confirmedAt);

  return (
    <div>
      <PageHeading
        title="Strategie"
        subtitle="Pe ce rankezi, ce să țintești, cum îi depășești pe competitori."
        actions={
          <div className="flex gap-2">
            <Link
              href={`/sites/${siteId}`}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
            >
              ← site
            </Link>
            {!needsWizard && (
              <Button onClick={() => rebuild.mutate()} disabled={rebuild.isPending}>
                {rebuild.isPending ? 'Se reconstruiește…' : 'Reconstruiește strategia'}
              </Button>
            )}
          </div>
        }
      />

      {rebuild.isSuccess && (
        <p className="mb-4 text-sm text-emerald-600">
          Am pus la lucru: profil → cuvinte cheie → poziții → competitori → plan. Durează câteva
          minute; reîmprospătează pagina.
        </p>
      )}

      {needsWizard ? (
        <ProfileWizard siteId={siteId} onDone={() => profile.refetch()} />
      ) : (
        <>
          <nav className="mb-6 flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  tab === t
                    ? 'border-neutral-900 font-medium dark:border-white'
                    : 'border-transparent text-neutral-500'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          {tab === 'Prezentare' && (
            <OverviewTab siteId={siteId} overview={overview.data} loading={overview.isLoading} />
          )}
          {tab === 'Cuvinte cheie' && <KeywordsTab siteId={siteId} onOpen={setDetailKw} />}
          {tab === 'Oportunități' && <OpportunitiesTab siteId={siteId} onOpen={setDetailKw} />}
          {tab === 'Competitori' && <CompetitorsTab siteId={siteId} />}
          {tab === 'Plan 30/60/90' && <RoadmapTab siteId={siteId} />}
        </>
      )}

      {detailKw && (
        <KeywordDetail siteId={siteId} kwId={detailKw} onClose={() => setDetailKw(null)} />
      )}
    </div>
  );
}

function Kpi({ label, value, term }: { label: string; value: string | number; term?: string }) {
  return (
    <Card>
      <div className="text-xs text-neutral-500">
        {term ? <SeoTermTooltip term={term}>{label}</SeoTermTooltip> : label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

function OverviewTab({
  siteId,
  overview,
  loading,
}: {
  siteId: string;
  overview: ReturnType<typeof useStrategyOverview>['data'];
  loading: boolean;
}) {
  const opps = useOpportunities(siteId);
  if (loading || !overview) return <Skeleton className="h-40 w-full" />;

  const quick = opps.data?.quick_win?.slice(0, 3) ?? [];
  const nextAction = quick[0];

  return (
    <div className="space-y-6">
      <Card>
        <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
          Ai <strong>{overview.keywords}</strong> cuvinte cheie în analiză. Rankezi pe{' '}
          <strong>{overview.ranking}</strong> dintre ele
          {overview.avgPosition != null && (
            <>
              , cu o <SeoTermTooltip term="poziție medie">poziție medie</SeoTermTooltip> de{' '}
              <strong>{overview.avgPosition}</strong>
            </>
          )}
          . <strong>{overview.top10}</strong> sunt în primele 10, <strong>{overview.top3}</strong> în
          primele 3. Ai <strong>{overview.striking}</strong> cuvinte în{' '}
          <SeoTermTooltip term="striking distance">striking distance</SeoTermTooltip> — cele mai
          rapide câștiguri.
        </p>
        {nextAction && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950">
            <span className="font-medium">Următoarea acțiune: </span>
            optimizează pagina pentru „{nextAction.keyword}” — ești pe poziția{' '}
            {nextAction.currentPosition != null ? Math.round(nextAction.currentPosition) : '?'} și un
            mic efort te poate duce pe prima pagină.
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Cuvinte în top 10" value={overview.top10} term="poziție" />
        <Kpi label="Poziție medie" value={overview.avgPosition ?? '—'} term="poziție medie" />
        <Kpi label="Câștiguri rapide" value={overview.striking} term="striking distance" />
        <Kpi label="Plan bifat" value={`${overview.roadmapDone}/${overview.roadmapTotal}`} />
      </div>
    </div>
  );
}

function KeywordsTab({ siteId, onOpen }: { siteId: string; onOpen: (id: string) => void }) {
  const [rank, setRank] = useState('');
  const [bucket, setBucket] = useState('');
  const { data, isLoading } = useKeywords(siteId, { rank, bucket });

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <select value={rank} onChange={(e) => setRank(e.target.value)} className="rounded-lg border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700">
          <option value="">toate</option>
          <option value="ranking">rankez deja</option>
          <option value="striking">striking distance</option>
          <option value="gap">nu rankez (gap)</option>
        </select>
        <select value={bucket} onChange={(e) => setBucket(e.target.value)} className="rounded-lg border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700">
          <option value="">orice categorie</option>
          <option value="quick_win">câștig rapid</option>
          <option value="build_content">de creat conținut</option>
          <option value="long_game">termen lung</option>
        </select>
      </div>
      {isLoading && <Skeleton className="h-64 w-full" />}
      {data && data.keywords.length === 0 && (
        <EmptyState title="Niciun cuvânt cheie" hint={'Apasă „Reconstruiește strategia".'} />
      )}
      {data && data.keywords.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2">Cuvânt cheie</th>
                <th className="px-3 py-2"><SeoTermTooltip term="poziție">Poziție</SeoTermTooltip></th>
                <th className="px-3 py-2 hidden sm:table-cell"><SeoTermTooltip term="volum">Volum</SeoTermTooltip></th>
                <th className="px-3 py-2 hidden md:table-cell"><SeoTermTooltip term="intenție">Intenție</SeoTermTooltip></th>
                <th className="px-3 py-2">Oportunitate</th>
              </tr>
            </thead>
            <tbody>
              {data.keywords.map((k) => (
                <tr
                  key={k.id}
                  onClick={() => onOpen(k.id)}
                  className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:border-neutral-800/60 dark:hover:bg-neutral-900"
                >
                  <td className="px-3 py-2">{k.keyword}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {k.currentPosition != null ? `#${Math.round(k.currentPosition)}` : '—'}
                  </td>
                  <td className="px-3 py-2 hidden tabular-nums sm:table-cell">{k.searchVolume || '—'}</td>
                  <td className="px-3 py-2 hidden md:table-cell">{k.intent ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge tone={scoreTone(k.opportunityScore)}>{k.opportunityScore ?? '—'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OpportunitiesTab({ siteId, onOpen }: { siteId: string; onOpen: (id: string) => void }) {
  const { data, isLoading } = useOpportunities(siteId);
  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(['quick_win', 'build_content', 'long_game'] as const).map((b) => (
        <div key={b}>
          <h3 className="mb-2 font-medium">{BUCKET_LABEL[b]}</h3>
          <div className="space-y-2">
            {(data[b] ?? []).slice(0, 15).map((k: KeywordRow) => (
              <button
                key={k.id}
                onClick={() => onOpen(k.id)}
                className="block w-full rounded-lg border border-neutral-200 p-3 text-left text-sm hover:border-neutral-400 dark:border-neutral-800"
              >
                <div className="flex items-center justify-between">
                  <span>{k.keyword}</span>
                  <Badge tone={scoreTone(k.opportunityScore)}>{k.opportunityScore ?? '—'}</Badge>
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {k.currentPosition != null ? `poziția ${Math.round(k.currentPosition)}` : 'nu rankezi'} ·
                  {k.searchVolume ? ` ~${k.searchVolume}/lună` : ' volum necunoscut'}
                </div>
              </button>
            ))}
            {(data[b] ?? []).length === 0 && (
              <p className="text-xs text-neutral-400">nimic aici încă</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompetitorsTab({ siteId }: { siteId: string }) {
  const { data: comps, isLoading } = useCompetitors(siteId);
  const add = useAddCompetitor(siteId);
  const del = useDeleteCompetitor(siteId);
  const [domain, setDomain] = useState('');
  const [openGap, setOpenGap] = useState<string | null>(null);
  const gap = useCompetitorGap(siteId, openGap);

  return (
    <div className="space-y-4">
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
            className="flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <Button type="submit" disabled={add.isPending}>
            Adaugă
          </Button>
        </form>
        <p className="mt-2 text-xs text-neutral-400">
          Îi analizăm crawlând site-urile lor — <SeoTermTooltip term="content gap">content gap</SeoTermTooltip>{' '}
          fără niciun serviciu plătit.
        </p>
      </Card>

      {isLoading && <Skeleton className="h-24 w-full" />}
      {comps?.map((c) => (
        <Card key={c.id}>
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">{c.domain}</span>
              <span className="ml-2 text-xs text-neutral-500">
                {c.pagesCrawled > 0 ? `${c.pagesCrawled} pagini analizate` : 'în curs de analiză…'}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpenGap(openGap === c.id ? null : c.id)}>
                {openGap === c.id ? 'ascunde' : 'content gap'}
              </Button>
              <Button variant="ghost" onClick={() => del.mutate(c.id)}>
                șterge
              </Button>
            </div>
          </div>
          {openGap === c.id && gap.data && (
            <div className="mt-3 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
              <table className="w-full text-left">
                <thead className="text-xs text-neutral-500">
                  <tr>
                    <th className="py-1">Grup de subiecte</th>
                    <th className="py-1">Tu</th>
                    <th className="py-1">El</th>
                    <th className="py-1">Diferență</th>
                  </tr>
                </thead>
                <tbody>
                  {gap.data.coverage
                    .filter((r) => r.gap !== 0 || r.competitorPages > 0)
                    .slice(0, 12)
                    .map((r) => (
                      <tr key={r.cluster} className="border-t border-neutral-100 dark:border-neutral-800/60">
                        <td className="py-1">{r.cluster}</td>
                        <td className="py-1 tabular-nums">{r.yourPages}</td>
                        <td className="py-1 tabular-nums">{r.competitorPages}</td>
                        <td className={`py-1 tabular-nums ${r.gap > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {r.gap > 0 ? `+${r.gap} la el` : r.gap < 0 ? `+${-r.gap} la tine` : '='}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function RoadmapTab({ siteId }: { siteId: string }) {
  const { data, isLoading } = useRoadmap(siteId);
  const update = useUpdateRoadmapItem(siteId);
  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;
  if (data.length === 0)
    return <EmptyState title="Niciun plan încă" hint={'Apasă „Reconstruiește strategia".'} />;

  return (
    <div className="space-y-6">
      {[30, 60, 90].map((phase) => (
        <div key={phase}>
          <h3 className="mb-2 font-medium">Următoarele {phase} de zile</h3>
          <div className="space-y-2">
            {data
              .filter((i) => i.phase === phase)
              .map((i) => (
                <div key={i.id} className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={i.status === 'done'}
                      onChange={(e) =>
                        update.mutate({ id: i.id, status: e.target.checked ? 'done' : 'todo' })
                      }
                      className="mt-1"
                    />
                    <span>
                      <span className={i.status === 'done' ? 'line-through text-neutral-400' : 'font-medium'}>
                        {i.title}
                      </span>
                      {i.why && <span className="mt-0.5 block text-xs text-neutral-500">{i.why}</span>}
                    </span>
                  </label>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
