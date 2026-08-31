'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useCrawl, useCrawlPages, useCrawlSummary } from '@/lib/queries';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';

/** Epic 8.8 — print-friendly report. "Save as PDF" from the browser print dialog. */
export default function ReportPage() {
  const crawlId = useParams().crawlId as string;
  const { data: crawl } = useCrawl(crawlId);
  const summary = useCrawlSummary(crawlId);
  const pages = useCrawlPages(crawlId);

  useEffect(() => {
    if (summary.data && pages.data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [summary.data, pages.data]);

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black">
      <style>{`@media print { .no-print { display: none } @page { margin: 16mm } }`}</style>
      <h1 className="text-2xl font-bold">Raport audit SEO</h1>
      <p className="text-sm text-neutral-600">
        Crawl {crawlId} · {crawl?.pagesScanned ?? 0} pagini ·{' '}
        {new Date(crawl?.completedAt ?? Date.now()).toLocaleDateString('ro-RO')}
      </p>

      {summary.data && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">Scor</h2>
          <ScoreBreakdown summary={summary.data} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">Pagini ({pages.data?.length ?? 0})</h2>
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b">
              <th className="py-1">URL</th>
              <th className="py-1">Scor</th>
              <th className="py-1">Tehnic</th>
              <th className="py-1">CWV</th>
              <th className="py-1">On-page</th>
              <th className="py-1">Conținut</th>
              <th className="py-1">GEO</th>
            </tr>
          </thead>
          <tbody>
            {pages.data?.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="max-w-xs truncate py-1">{new URL(p.url).pathname}</td>
                <td className="py-1">{p.scoreTotal ?? '—'}</td>
                <td className="py-1">{p.scoreTechnical ?? '—'}</td>
                <td className="py-1">{p.scoreCwv ?? '—'}</td>
                <td className="py-1">{p.scoreOnpage ?? '—'}</td>
                <td className="py-1">{p.scoreContent ?? '—'}</td>
                <td className="py-1">{p.scoreGeo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <button
        className="no-print mt-8 rounded border px-3 py-2 text-sm"
        onClick={() => window.print()}
      >
        Printează / salvează PDF
      </button>
    </div>
  );
}
