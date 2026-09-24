'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  usePage,
  usePageIssues,
  usePageRecommendations,
  useSite,
  type IssueDto,
} from '@/lib/queries';
import { useOnPageKeywords, type LengthStatus, type MetaAudit, type RankedKeyword } from '@/lib/onpage';
import { RecommendationCard } from '@/components/RecommendationCard';
import { Badge, Card, EmptyState, ErrorState, PageHeading, Skeleton, scoreTone } from '@/components/ui';

export default function PageDetail() {
  const pageId = useParams().pageId as string;
  const page = usePage(pageId);
  const issues = usePageIssues(pageId);
  const recos = usePageRecommendations(pageId);
  const onPage = useOnPageKeywords(pageId);
  const site = useSite(page.data?.siteId ?? '');

  if (page.isLoading) return <Skeleton className="h-64 w-full" />;
  if (page.error) return <ErrorState error={page.error} />;
  if (!page.data) return null;

  const p = page.data.page;
  const wpConnected = site.data?.connectionType === 'wordpress' && !!site.data?.wpSiteUrl;

  const grouped: Record<'critical' | 'warning' | 'info', IssueDto[]> = {
    critical: [],
    warning: [],
    info: [],
  };
  for (const i of issues.data ?? []) grouped[i.severity].push(i);

  return (
    <div className="space-y-6">
      <PageHeading
        title={new URL(p.url).pathname || '/'}
        subtitle={p.url}
        actions={
          page.data.crawlId && (
            <div className="flex gap-3 text-sm">
              <Link
                href={`/sites/${page.data.siteId}/tasks`}
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                ← Sarcini
              </Link>
              <Link
                href={`/crawls/${page.data.crawlId}`}
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                raport crawl
              </Link>
            </div>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {(['scoreTotal', 'scoreTechnical', 'scoreCwv', 'scoreOnpage', 'scoreContent', 'scoreGeo'] as const).map(
          (k) => (
            <Card key={k}>
              <div className="text-xs text-[var(--text-muted)]">
                {k.replace('score', '').toLowerCase() || 'total'}
              </div>
              <div className="mt-1 text-2xl font-semibold">
                <Badge tone={scoreTone(p[k])}>{p[k] ?? '—'}</Badge>
              </div>
            </Card>
          ),
        )}
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Meta label="Status" value={String(p.statusCode ?? '—')} />
          <Meta label="Indexabilitate" value={p.indexability ?? '—'} />
          <Meta label="Cuvinte" value={String(p.wordCount)} />
          <Meta label="Randare" value={p.renderedWith} />
          <Meta label="LCP" value={p.lcpMs != null ? `${(p.lcpMs / 1000).toFixed(1)}s` : '—'} />
          <Meta label="INP" value={p.inpMs != null ? `${Math.round(p.inpMs)}ms` : '—'} />
          <Meta label="CLS" value={p.clsScore != null ? p.clsScore.toFixed(2) : '—'} />
        </div>
      </Card>

      <div>
        <h2 className="mb-3 font-medium">Structură & cuvinte cheie</h2>
        {onPage.isLoading && <Skeleton className="h-40 w-full" />}
        {onPage.data && <OnPageSection analysis={onPage.data} />}
      </div>

      <div>
        <h2 className="mb-3 font-medium">Probleme</h2>
        {issues.isLoading && <Skeleton className="h-24 w-full" />}
        {issues.data && issues.data.length === 0 && <EmptyState title="Nicio problemă detectată 🎉" />}
        <div className="space-y-4">
          {(['critical', 'warning', 'info'] as const).map((sev) =>
            grouped[sev].length > 0 ? (
              <div key={sev}>
                <div className="mb-2">
                  <Badge tone={sev}>{sev}</Badge>
                </div>
                <ul className="space-y-1 text-sm">
                  {grouped[sev].map((i) => (
                    <li key={i.id} className="rounded-lg border border-[var(--border)] p-3">
                      <span className="text-[var(--text-muted)]">{i.ruleId}</span> — {i.description}
                      {i.detectedValue && <span className="text-[var(--text-faint)]"> ({i.detectedValue})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-medium">Recomandări</h2>
        {recos.isLoading && <Skeleton className="h-24 w-full" />}
        {recos.data && recos.data.length === 0 && (
          <EmptyState title="Nicio recomandare" hint="Rulează pipeline-ul de scoring/recomandări." />
        )}
        <div className="space-y-3">
          {recos.data?.map((r) => (
            <RecommendationCard key={r.reco.id} {...r} pageId={pageId} wpConnected={wpConnected} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function lengthTone(s: LengthStatus): 'good' | 'warning' | 'critical' {
  return s === 'ok' ? 'good' : s === 'missing' ? 'critical' : 'warning';
}
const LENGTH_LABEL: Record<LengthStatus, string> = {
  ok: 'lungime ok',
  missing: 'lipsește',
  short: 'prea scurt',
  long: 'prea lung',
};
const FOUND_IN_LABEL: Record<keyof RankedKeyword['foundIn'], string> = {
  h1: 'H1',
  h2: 'H2',
  title: 'Title',
  url: 'URL',
  intro: 'Intro',
  body: 'Text',
};

function OnPageSection({ analysis }: { analysis: import('@/lib/onpage').OnPageAnalysis }) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 text-xs font-medium text-[var(--text-muted)]">Structura de headings</div>
        {analysis.headingTree.length === 0 ? (
          <p className="text-sm text-[var(--text-faint)]">Nicio structură de headings găsită.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {analysis.headingTree.map((h, i) => (
              <li
                key={i}
                style={{ marginLeft: `${(h.level - 1) * 16}px` }}
                className={h.level === 1 ? 'font-semibold' : 'text-[var(--text-muted)]'}
              >
                <span className="text-[var(--text-faint)]">H{h.level}</span> {h.text}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <MetaAuditCard meta={analysis.meta} primaryKeyword={analysis.primaryKeyword} />

      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Cuvinte cheie găsite pe pagină
          </div>
          {analysis.primaryKeyword && (
            <div className="text-xs text-[var(--text-faint)]">
              cuvânt țintă analizat: <strong>{analysis.primaryKeyword}</strong>
            </div>
          )}
        </div>
        {analysis.keywords.length === 0 ? (
          <p className="text-sm text-[var(--text-faint)]">
            Nu s-a găsit niciun cuvânt cheie recurent pe pagină.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-muted)]">
                  <th className="py-1.5 pr-3 font-medium">Cuvânt cheie</th>
                  <th className="py-1.5 pr-3 font-medium">Apariții</th>
                  <th className="py-1.5 pr-3 font-medium">Volum</th>
                  <th className="py-1.5 font-medium">Găsit în</th>
                </tr>
              </thead>
              <tbody>
                {analysis.keywords.map((k) => (
                  <tr key={k.phrase} className="border-t border-[var(--border)]">
                    <td className="py-1.5 pr-3 font-medium">{k.phrase}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{k.occurrences}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-[var(--text-muted)]">
                      {k.searchVolume != null ? k.searchVolume.toLocaleString('ro-RO') : '—'}
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(FOUND_IN_LABEL) as (keyof RankedKeyword['foundIn'])[])
                          .filter((z) => k.foundIn[z])
                          .map((z) => (
                            <Badge key={z} tone="neutral">
                              {FOUND_IN_LABEL[z]}
                            </Badge>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--text-faint)]">
          Ordonate după relevanță ponderată: H1 &gt; Title &gt; H2 &gt; URL &gt; primul paragraf &gt;
          restul textului. Volumul apare doar pentru fraze care se potrivesc cu un cuvânt din
          universul de cuvinte cheie al site-ului.
        </p>
      </Card>
    </div>
  );
}

function MetaAuditCard({
  meta,
  primaryKeyword,
}: {
  meta: MetaAudit;
  primaryKeyword: string | null;
}) {
  return (
    <Card>
      <div className="mb-2 text-xs font-medium text-[var(--text-muted)]">
        Title, meta description & alt-uri
        {!primaryKeyword && <span className="ml-1 text-[var(--text-faint)]">(fără cuvânt țintă)</span>}
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Title</span>
            <Badge tone={lengthTone(meta.title.lengthStatus)}>
              {meta.title.length} car. · {LENGTH_LABEL[meta.title.lengthStatus]}
            </Badge>
            {primaryKeyword && (
              <Badge tone={meta.title.hasPrimaryKeyword ? 'good' : 'critical'}>
                {meta.title.hasPrimaryKeyword ? '✓ conține cuvântul cheie' : '✕ nu conține cuvântul cheie'}
              </Badge>
            )}
            {meta.title.hasPrimaryKeyword && !meta.title.keywordNearStart && (
              <Badge tone="warning">departe de început</Badge>
            )}
          </div>
          <p className="mt-1 text-[var(--text-muted)]">{meta.title.text || '—'}</p>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Meta description</span>
            <Badge tone={lengthTone(meta.metaDescription.lengthStatus)}>
              {meta.metaDescription.length} car. · {LENGTH_LABEL[meta.metaDescription.lengthStatus]}
            </Badge>
            {primaryKeyword && (
              <Badge tone={meta.metaDescription.hasPrimaryKeyword ? 'good' : 'critical'}>
                {meta.metaDescription.hasPrimaryKeyword ? '✓ conține cuvântul cheie' : '✕ nu conține cuvântul cheie'}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[var(--text-muted)]">{meta.metaDescription.text || '—'}</p>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">H1</span>
            {primaryKeyword && (
              <Badge tone={meta.h1.hasPrimaryKeyword ? 'good' : 'critical'}>
                {meta.h1.hasPrimaryKeyword ? '✓ conține cuvântul cheie' : '✕ nu conține cuvântul cheie'}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[var(--text-muted)]">{meta.h1.text || '—'}</p>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Alt text imagini</span>
            <Badge tone={meta.altTexts.missingAlt === 0 ? 'good' : 'warning'}>
              {meta.altTexts.totalImages - meta.altTexts.missingAlt}/{meta.altTexts.totalImages} au alt
            </Badge>
            {meta.altTexts.stuffingRisk && (
              <Badge tone="warning">posibil keyword stuffing în alt-uri</Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
