'use client';

import { createBrowserClient } from '@supabase/ssr';

// Fallbacks keep `createBrowserClient` from throwing during a build with no env set
// (CI, `next build` before secrets are wired). At runtime the real values must be present.
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const KEY_ = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-placeholder';

export function createClient() {
  return createBrowserClient(URL_, KEY_);
}
