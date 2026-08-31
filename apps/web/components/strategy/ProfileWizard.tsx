'use client';

import { useState } from 'react';
import { useProfile, useSaveProfile, useRebuildStrategy, useAddCompetitor } from '@/lib/strategy';
import { Button, Card } from '@/components/ui';

/** Epic 18.2 — first-run: confirm the auto-detected profile + add competitors, then build. */
export function ProfileWizard({ siteId, onDone }: { siteId: string; onDone: () => void }) {
  const { data: profile } = useProfile(siteId);
  const save = useSaveProfile(siteId);
  const rebuild = useRebuildStrategy(siteId);
  const addCompetitor = useAddCompetitor(siteId);

  const [services, setServices] = useState<string>((profile?.services ?? []).join('\n'));
  const [locations, setLocations] = useState<string>((profile?.locations ?? ['Romania']).join(', '));
  const [summary, setSummary] = useState<string>(profile?.summary ?? '');
  const [competitorsText, setCompetitorsText] = useState('');
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    try {
      await save.mutateAsync({
        summary,
        services: services.split('\n').map((s) => s.trim()).filter(Boolean),
        locations: locations.split(',').map((s) => s.trim()).filter(Boolean),
        confirmed: true,
      });
      for (const d of competitorsText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)) {
        await addCompetitor.mutateAsync(d).catch(() => {});
      }
      await rebuild.mutateAsync();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Configurează strategia</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Am pornit de la ce e pe site-ul tău. Verifică și completează — pe baza asta găsim cuvintele
        cheie potrivite.
      </p>

      <div className="mt-4 space-y-4">
        <label className="block text-sm">
          <span className="text-neutral-500">Ce servicii oferi? (unul pe linie)</span>
          <textarea
            rows={5}
            value={services}
            onChange={(e) => setServices(e.target.value)}
            placeholder={'Google Ads\nFacebook Ads\nCreare site-uri web\nMagazine online'}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
          />
        </label>

        <label className="block text-sm">
          <span className="text-neutral-500">Zone / orașe (separate prin virgulă)</span>
          <input
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            placeholder="Romania, Bucuresti, Cluj"
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
          />
        </label>

        <label className="block text-sm">
          <span className="text-neutral-500">O frază despre afacere (opțional)</span>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Agenție de marketing digital din România."
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
          />
        </label>

        <label className="block text-sm">
          <span className="text-neutral-500">Competitori (domenii, unul pe linie)</span>
          <textarea
            rows={3}
            value={competitorsText}
            onChange={(e) => setCompetitorsText(e.target.value)}
            placeholder={'competitor1.ro\ncompetitor2.ro'}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
          />
          <span className="mt-1 block text-xs text-neutral-400">
            Îi analizăm crawlând site-urile lor — nu e nevoie de niciun serviciu plătit.
          </span>
        </label>

        <Button disabled={busy} onClick={finish}>
          {busy ? 'Se construiește strategia…' : 'Salvează și construiește strategia'}
        </Button>
      </div>
    </Card>
  );
}
