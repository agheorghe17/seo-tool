'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCrawl, type CrawlDto } from '@/lib/queries';
import { Badge } from './ui';

/**
 * Epic 8.2 — live crawl progress. Subscribes to the `crawls` row via Supabase Realtime and
 * falls back to polling the API (react-query `refetchInterval`) when Realtime isn't available.
 */
export function CrawlProgress({ crawlId }: { crawlId: string }) {
  const isTerminal = (s?: string) => s === 'completed' || s === 'failed';
  const [realtimeRow, setRealtimeRow] = useState<Partial<CrawlDto> | null>(null);
  const query = useCrawl(crawlId, true);
  const crawl = { ...(query.data ?? {}), ...(realtimeRow ?? {}) } as CrawlDto;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`crawl:${crawlId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'crawls', filter: `id=eq.${crawlId}` },
        (payload) => setRealtimeRow(payload.new as Partial<CrawlDto>),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [crawlId]);

  useEffect(() => {
    if (isTerminal(crawl.status)) void query.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawl.status]);

  const pct =
    crawl.pagesTotal && crawl.pagesTotal > 0
      ? Math.min(100, Math.round((crawl.pagesScanned / crawl.pagesTotal) * 100))
      : crawl.status === 'completed'
        ? 100
        : 0;

  const tone =
    crawl.status === 'completed'
      ? 'good'
      : crawl.status === 'failed'
        ? 'critical'
        : crawl.status === 'partial'
          ? 'warning'
          : 'info';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Badge tone={tone}>{crawl.status ?? '—'}</Badge>
        <span className="tabular-nums text-neutral-500">
          {crawl.pagesScanned ?? 0} / {crawl.pagesTotal ?? 0} pagini
          {crawl.pagesRendered ? ` · ${crawl.pagesRendered} randate` : ''}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-2 rounded-full bg-neutral-900 transition-all dark:bg-white"
          style={{ width: `${pct}%` }}
        />
      </div>
      {crawl.error && <p className="text-xs text-red-600">{crawl.error}</p>}
    </div>
  );
}
