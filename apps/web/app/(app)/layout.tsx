import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Nav } from '@/components/Nav';
import { createClient } from '@/lib/supabase/server';

// Everything under (app) is per-user, auth-gated data — never prerender it.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen">
      <Nav email={user.email ?? null} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
