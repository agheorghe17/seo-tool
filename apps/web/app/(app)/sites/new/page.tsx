'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateSite } from '@/lib/queries';
import { Button, Card, PageHeading } from '@/components/ui';

export default function NewSitePage() {
  const router = useRouter();
  const create = useCreateSite();
  const [domain, setDomain] = useState('');
  const [connectionType, setConnectionType] = useState<'universal' | 'wordpress'>('universal');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await create.mutateAsync({ domain, connectionType });
    router.push(`/sites/${res.site.id}`);
  }

  return (
    <div>
      <PageHeading title="Site nou" subtitle="Adaugă domeniul, apoi verifică proprietatea." />
      <Card className="max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="text-neutral-500">Domeniu</span>
            <input
              required
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
            />
          </label>

          <fieldset className="space-y-2 text-sm">
            <span className="text-neutral-500">Tip conexiune</span>
            {(['universal', 'wordpress'] as const).map((t) => (
              <label key={t} className="flex items-start gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <input
                  type="radio"
                  name="ct"
                  checked={connectionType === t}
                  onChange={() => setConnectionType(t)}
                  className="mt-1"
                />
                <span>
                  <strong>{t === 'universal' ? 'Universal' : 'WordPress'}</strong>
                  <span className="block text-xs text-neutral-500">
                    {t === 'universal'
                      ? 'Verificare prin meta tag / fișier HTML / DNS TXT. Doar citire (raport de recomandări).'
                      : 'Conectare prin Application Password. Permite aplicarea automată de fix-uri sigure.'}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Se creează…' : 'Creează site'}
          </Button>
          {create.isError && (
            <p className="text-sm text-red-600">{(create.error as Error).message}</p>
          )}
        </form>
      </Card>
    </div>
  );
}
