'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

export function Nav({ email }: { email: string | null }) {
  const { signOut } = useAuth();
  const router = useRouter();
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/sites" className="font-semibold">
          SEO Audit
        </Link>
        <div className="flex items-center gap-4 text-sm text-neutral-500">
          {email && <span className="hidden sm:inline">{email}</span>}
          <button
            className="hover:text-neutral-900 dark:hover:text-neutral-100"
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
