'use client';

import Link from 'next/link';

const TABS = [
  { seg: 'keywords', label: 'Cuvinte cheie' },
  { seg: 'competitors', label: 'Competitori' },
  { seg: 'pages-plan', label: 'Pagini' },
  { seg: 'structura', label: 'Structură' },
  { seg: 'linkuri', label: 'Linkuri interne' },
  { seg: 'declin', label: 'Declin' },
  { seg: 'rezultate', label: 'Ce a funcționat' },
] as const;

export function AnalysisNav({ siteId, active }: { siteId: string; active: string }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {TABS.map((t) => (
        <Link
          key={t.seg}
          href={`/sites/${siteId}/${t.seg}`}
          className={
            active === t.seg
              ? 'font-medium text-[var(--text)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
