'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCrawl, useCrawlPages, useCrawlSummary } from '@/lib/queries';
import { CrawlProgress } from '@/components/CrawlProgress';
import { PagesTable } from '@/components/PagesTable';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { Badge, Card, EmptyState, ErrorState, PageHeading, Skeleton } from '@/components/ui';

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export default function CrawlPage() {
  const crawlId = useParams().crawlId as string;
  const { data: crawl, error } = useCrawl(crawlId, true);
  const summary = useCrawlSummary(crawlId);
  const pages = useCrawlPages(crawlId);

  const done = crawl?.status === 'completed' || crawl?.status === 'partial';

  function downloadCsv() {
    if (!pages.data) return;
    const csv = toCsv(
      pages.data.map((p) => ({
        url: p.url,
        score: p.scoreTotal,
        technical: p.scoreTechnical,
        cwv: p.scoreCwv,
        onpage: p.scoreOnpage,
        content: p.scoreContent,
        geo: p.scoreGeo,
        words: p.wordCount,
        status: p.statusCode,
        indexability: p.indexability,
        lcp_ms: p.lcpMs,
      })),
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `crawl-${crawlId}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Raport crawl"
        subtitle={crawl ? new Date(crawl.startedAt ?? Date.now()).toLocaleString('ro-RO') : ''}
        actions={
          done && (
            <div className="flex gap-2">
              <button onClick={downloadCsv} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
                Export CSV
              </button>
              <Link
                href={`/crawls/${crawlId}/report`}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
              >
                Raport imprimabil (PDF)
              </Link>
            </div>
          )
        }
      />

      {error && <ErrorState error={error} />}

      <Card>
        <CrawlProgress crawlId={crawlId} />
      </Card>

      {summary.data && summary.data.pages > 0 && (
        <Card>
          <ScoreBreakdown summary={summary.data} />
          <div className="mt-4 flex gap-2">
            {(['critical', 'warning', 'info'] as const).map((s) => (
              <Badge key={s} tone={s}>
                {summary.data!.issues[s] ?? 0} {s}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div>
        <h2 className="mb-3 font-medium">Pagini</h2>
        {pages.isLoading && <Skeleton className="h-40 w-full" />}
        {pages.data && pages.data.length === 0 && (
          <EmptyState title="Nicio pagină încă" hint="Crawl-ul rulează sau nu a găsit pagini." />
        )}
        {pages.data && pages.data.length > 0 && <PagesTable pages={pages.data} />}
      </div>
    </div>
  );
}
