'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

export function Nav({ email }: { email: string | null }) {
  const { signOut } = useAuth();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/sites" className="flex items-center gap-2 font-semibold">
          <span
            className="grid h-6 w-6 place-items-center rounded-md text-white"
            style={{ background: 'var(--accent)' }}
            aria-hidden
          >
            ✦
          </span>
          SEO Autopilot
        </Link>
        <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
          <Link href="/sites" className="hover:text-[var(--text)]">
            Site-uri
          </Link>
          <Link href="/privacy" className="hover:text-[var(--text)]">
            Date
          </Link>
          {email && <span className="hidden sm:inline text-[var(--text-faint)]">{email}</span>}
          <button
            className="hover:text-[var(--text)]"
            onClick={async () => {
              await signOut();
              router.push('/login');
            }}
          >
            Ieșire
          </button>
        </div>
      </div>
    </header>
  );
}
