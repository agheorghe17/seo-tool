'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useSite } from '@/lib/queries';

const TABS = [
  { seg: '', label: 'Autopilot' },
  { seg: 'tasks', label: 'Aprobări' },
  { seg: 'content', label: 'Conținut' },
  { seg: 'keywords', label: 'Analiză', alias: ['competitors'] },
  { seg: 'settings', label: 'Setări' },
] as const;

export default function SiteLayout({ children }: { children: ReactNode }) {
  const siteId = useParams().siteId as string;
  const pathname = usePathname();
  const { data: site } = useSite(siteId);
  const base = `/sites/${siteId}`;
  const current = pathname.replace(base, '').replace(/^\//, '').split('/')[0] ?? '';

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Link href="/sites" className="hover:text-[var(--text)]">
          Site-uri
        </Link>
        <span>/</span>
        <span className="font-medium text-[var(--text)]">{site?.domain ?? '…'}</span>
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map((t) => {
          const href = t.seg ? `${base}/${t.seg}` : base;
          const aliases = 'alias' in t ? (t.alias as readonly string[]) : [];
          const active = current === t.seg || aliases.includes(current);
          return (
            <Link
              key={t.seg}
              href={href}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
                active
                  ? 'border-[var(--accent)] font-medium text-[var(--text)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
