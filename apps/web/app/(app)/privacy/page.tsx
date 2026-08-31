'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { Button, Card, PageHeading } from '@/components/ui';

export default function PrivacyPage() {
  const { token, signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true);
    try {
      const data = await apiFetch<unknown>('/api/me/export', { token });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'seo-tool-export.json';
      a.click();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!confirm('Ștergi definitiv contul și toate datele? Acțiunea este ireversibilă.')) return;
    setBusy(true);
    try {
      await apiFetch('/api/me', { method: 'DELETE', token });
      await signOut();
      router.push('/login');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeading title="Confidențialitate & date" />
      <div className="space-y-4">
        <Card>
          <h2 className="font-medium">Ce stocăm</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Domeniile adăugate, rezultatele crawl-urilor (pagini, scoruri, probleme, recomandări) și estimările de trafic.
            Parolele de aplicație WordPress și token-urile Google sunt criptate la rest (AES-256-GCM) și nu sunt niciodată logate.
            Nu vindem date și nu le partajăm cu terți.
          </p>
        </Card>
        <Card>
          <h2 className="font-medium">Exportă datele</h2>
          <p className="mt-1 text-sm text-neutral-500">Descarcă tot ce ține de contul tău în format JSON.</p>
          <div className="mt-3">
            <Button variant="ghost" disabled={busy} onClick={exportData}>
              Exportă JSON
            </Button>
          </div>
        </Card>
        <Card>
          <h2 className="font-medium">Șterge contul</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Elimină contul și toate datele asociate. Ireversibil.
          </p>
          <div className="mt-3">
            <Button variant="danger" disabled={busy} onClick={deleteAccount}>
              Șterge definitiv
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
