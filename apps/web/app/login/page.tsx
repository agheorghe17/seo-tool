'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Card } from '@/components/ui';

function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/sites';
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const fn =
      mode === 'signin'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error } = await fn;
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === 'signup') return setMsg('Verifică emailul pentru confirmare, apoi autentifică-te.');
    router.push(next);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm items-center px-6">
      <Card className="w-full">
        <h1 className="text-lg font-semibold">
          {mode === 'signin' ? 'Autentificare' : 'Cont nou'}
        </h1>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="parolă"
            className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <Button type="submit" disabled={busy}>
            {busy ? '…' : mode === 'signin' ? 'Intră' : 'Creează cont'}
          </Button>
        </form>
        {msg && <p className="mt-3 text-sm text-amber-600">{msg}</p>}
        <button
          className="mt-4 text-xs text-neutral-500 hover:underline"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? 'Nu ai cont? Înregistrează-te' : 'Ai deja cont? Autentifică-te'}
        </button>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
