'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AuthProvider } from '@/components/AuthProvider';
import { Toaster } from '@/components/Toaster';
import { pushToast } from '@/lib/toast';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
          mutations: {
            onError: (err) => {
              const msg = err instanceof Error ? err.message : 'Ceva n-a mers. Încearcă din nou.';
              pushToast(msg, 'error');
            },
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
