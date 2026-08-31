'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PageDto } from '@/lib/queries';
import { Badge, scoreTone } from './ui';

type SortKey = 'scoreTotal' | 'url' | 'wordCount';

export function PagesTable({ pages }: { pages: PageDto[] }) {
  const [sort, setSort] = useState<SortKey>('scoreTotal');
  const [asc, setAsc] = useState(true);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const filtered = q
      ? pages.filter((p) => p.url.toLowerCase().includes(q.toLowerCase()))
      : pages;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sort] ?? (sort === 'url' ? '' : -1);
      const bv = b[sort] ?? (sort === 'url' ? '' : -1);
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [pages, sort, asc, q]);

  const th = (key: SortKey, label: string) => (
    <button
      className="font-medium hover:underline"
      onClick={() => {
        if (sort === key) setAsc(!asc);
        else {
          setSort(key);
          setAsc(key === 'url');
        }
      }}
    >
      {label} {sort === key ? (asc ? '▲' : '▼') : ''}
    </button>
  );

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filtrează după URL…"
        className="mb-3 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
      />
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">{th('url', 'URL')}</th>
              <th className="px-3 py-2">{th('scoreTotal', 'Scor')}</th>
              <th className="px-3 py-2 hidden sm:table-cell">{th('wordCount', 'Cuvinte')}</th>
              <th className="px-3 py-2 hidden md:table-cell">Status</th>
              <th className="px-3 py-2 hidden lg:table-cell">CWV (LCP)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                <td className="max-w-xs truncate px-3 py-2">
                  <Link href={`/pages/${p.id}`} className="hover:underline">
                    {new URL(p.url).pathname || '/'}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={scoreTone(p.scoreTotal)}>{p.scoreTotal ?? '—'}</Badge>
                </td>
                <td className="px-3 py-2 hidden tabular-nums sm:table-cell">{p.wordCount}</td>
                <td className="px-3 py-2 hidden md:table-cell">{p.statusCode ?? '—'} · {p.indexability ?? '—'}</td>
                <td className="px-3 py-2 hidden tabular-nums lg:table-cell">
                  {p.lcpMs != null ? `${(p.lcpMs / 1000).toFixed(1)}s` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
