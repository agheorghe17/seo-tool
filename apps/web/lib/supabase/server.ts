import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const KEY_ = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-placeholder';

/** Supabase client for Server Components / Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(URL_, KEY_, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // called from a Server Component — safe to ignore, middleware refreshes the session
        }
      },
    },
  });
}
