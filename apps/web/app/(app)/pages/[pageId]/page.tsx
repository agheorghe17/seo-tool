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
import { RecommendationCard } from '@/components/RecommendationCard';
import { Badge, Card, EmptyState, ErrorState, PageHeading, Skeleton, scoreTone } from '@/components/ui';

export default function PageDetail() {
  const pageId = useParams().pageId as string;
  const page = usePage(pageId);
  const issues = usePageIssues(pageId);
  const recos = usePageRecommendations(pageId);
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
            <Link href={`/crawls/${page.data.crawlId}`} className="text-sm text-neutral-500 hover:underline">
              ← înapoi la crawl
            </Link>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {(['scoreTotal', 'scoreTechnical', 'scoreCwv', 'scoreOnpage', 'scoreContent', 'scoreGeo'] as const).map(
          (k) => (
            <Card key={k}>
              <div className="text-xs text-neutral-500">
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
                    <li key={i.id} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                      <span className="text-neutral-500">{i.ruleId}</span> — {i.description}
                      {i.detectedValue && <span className="text-neutral-400"> ({i.detectedValue})</span>}
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
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
