'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  useConnectGa,
  useConnectGsc,
  useConnectWordpress,
  useSite,
  useStartCrawl,
  useVerifySite,
} from '@/lib/queries';
import { useProfile, useRebuildStrategy, useSaveProfile } from '@/lib/strategy';
import { useAddRule, useDeleteRule, usePlaybook, useUpdateRule } from '@/lib/playbook';
import { Badge, Button, Card, ErrorState, SectionTitle, Skeleton } from '@/components/ui';

const METHODS = [
  { id: 'meta_tag', label: 'Meta tag', how: (t: string) => `<meta name="seo-tool-verification" content="${t}">` },
  { id: 'html_file', label: 'Fișier HTML', how: (t: string) => `Urcă /${t}.html care conține exact: ${t}` },
  { id: 'dns_txt', label: 'DNS TXT', how: (t: string) => `Înregistrare TXT: seo-tool-verification=${t}` },
];

const inputCls =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm';

export default function SettingsPage() {
  const siteId = useParams().siteId as string;
  const { data: site, isLoading, error } = useSite(siteId);
  const verify = useVerifySite(siteId);
  const startCrawl = useStartCrawl(siteId);
  const connectGsc = useConnectGsc(siteId);
  const connectGa = useConnectGa(siteId);
  const rebuild = useRebuildStrategy(siteId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState error={error} />;
  if (!site) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Setări</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Conexiuni, verificare și profilul afacerii. Le configurezi o dată.
        </p>
      </div>

      <Card>
        <SectionTitle>Acțiuni</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => startCrawl.mutate()}
            disabled={startCrawl.isPending || site.lastCrawl?.status === 'running'}
          >
            {site.lastCrawl?.status === 'running' ? 'Scan în curs…' : 'Scanează din nou'}
          </Button>
          <Button variant="ghost" onClick={() => rebuild.mutate()} disabled={rebuild.isPending}>
            {rebuild.isPending ? 'Se reface…' : 'Reconstruiește strategia'}
          </Button>
        </div>
        {(startCrawl.isError || rebuild.isError) && (
          <p className="mt-2 text-sm text-[var(--bad)]">
            {((startCrawl.error ?? rebuild.error) as Error).message}
          </p>
        )}
        {rebuild.isSuccess && (
          <p className="mt-2 text-sm text-[var(--good)]">
            Am pus la lucru: profil → cuvinte cheie → poziții → competitori → plan. Durează câteva
            minute.
          </p>
        )}
      </Card>

      {!site.verified && !site.wpSiteUrl && (
        <Card>
          <SectionTitle>Verifică proprietatea</SectionTitle>
          <p className="text-sm text-[var(--text-muted)]">
            Alege o metodă, aplic-o pe site, apoi apasă „Verifică”. Token:
          </p>
          <code className="mt-2 block break-all rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-2 text-xs">
            {site.verificationToken}
          </code>
          <div className="mt-4 space-y-3">
            {METHODS.map((m) => (
              <div
                key={m.id}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <strong>{m.label}</strong>
                  <Button size="sm" variant="ghost" onClick={() => verify.mutate(m.id)}>
                    Verifică
                  </Button>
                </div>
                <p className="mt-1 break-all text-xs text-[var(--text-muted)]">
                  {m.how(site.verificationToken)}
                </p>
              </div>
            ))}
          </div>
          {verify.data && !verify.data.verified && (
            <p className="mt-3 text-sm text-[var(--warn)]">{verify.data.reason}</p>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle>WordPress</SectionTitle>
          <Badge tone={site.wpSiteUrl ? 'good' : 'neutral'}>
            {site.wpSiteUrl ? 'conectat' : 'neconectat'}
          </Badge>
        </div>
        {site.wpSiteUrl ? (
          <p className="text-sm text-[var(--text-muted)]">
            Conectat la <code>{site.wpSiteUrl}</code>. Reparațiile marcate „auto” pot fi aplicate
            direct pe site din pagina fiecărei sarcini.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-[var(--text-muted)]">
              Instalează pluginul „SEO Audit Connector”, generează o parolă de conectare din Setări →
              SEO Audit și lipește-o mai jos.
            </p>
            <WpConnect siteId={siteId} />
          </>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle>Google Search Console</SectionTitle>
          <div className="flex items-center gap-2">
            {site.gscConnected && <Badge tone="good">conectat</Badge>}
            <Button size="sm" variant="ghost" onClick={() => connectGsc.mutate(undefined)}>
              {site.gscConnected ? 'Reconectează' : 'Conectează'}
            </Button>
          </div>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Conectat = poziții reale, câștiguri rapide și tracking săptămânal automat, plus o estimare
          de trafic mai sigură.
        </p>
        {connectGsc.isError && (
          <p className="mt-2 text-sm text-[var(--warn)]">
            {(connectGsc.error as Error).message.includes('GOOGLE_OAUTH')
              ? 'Google OAuth nu e configurat în .env. Opțional — restul aplicației merge și fără GSC.'
              : (connectGsc.error as Error).message}
          </p>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle>Google Analytics 4</SectionTitle>
          <div className="flex items-center gap-2">
            {site.ga4Connected && <Badge tone="good">conectat</Badge>}
            <Button size="sm" variant="ghost" onClick={() => connectGa.mutate()}>
              {site.ga4Connected ? 'Reconectează' : 'Conectează'}
            </Button>
          </div>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Trafic real din analytics: sesiuni organice ca bază pentru estimare (crește încrederea) și
          un panou cu traficul real.
        </p>
        {site.ga4Connected && !site.ga4Property && (
          <p className="mt-2 text-sm text-[var(--warn)]">
            Cont Google conectat, dar nu am găsit încă o proprietate GA4 accesibilă. Verifică în{' '}
            <a
              href="https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Google Cloud
            </a>{' '}
            că „Google Analytics Admin API” și „Google Analytics Data API” sunt activate, și că
            adresa conectată are acces la o proprietate GA4. Se reîncearcă automat la prima citire de
            trafic.
          </p>
        )}
        {connectGa.isError && (
          <p className="mt-2 text-sm text-[var(--warn)]">{(connectGa.error as Error).message}</p>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle>Google Business Profile</SectionTitle>
          <Badge tone="neutral">necesită aprobare Google</Badge>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Datele din Business Profile (apeluri, direcții, vizualizări) cer o cerere de acces API
          aprobată de Google.{' '}
          <a
            href="https://developers.google.com/my-business/content/prereqs"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent-text)] underline"
          >
            Trimite cererea
          </a>
          . Relevant doar dacă ai ales „Local — un oraș” la Piață țintă; altfel îl poți ignora.
        </p>
      </Card>

      <ProfileCard siteId={siteId} />

      <BlogPublishCard siteId={siteId} />

      <PlaybookCard siteId={siteId} />

      {site.lastCrawl && (
        <p className="text-xs text-[var(--text-faint)]">
          Ultimul scan: {site.lastCrawl.status} · {site.lastCrawl.pagesScanned} pagini
        </p>
      )}
    </div>
  );
}

function ProfileCard({ siteId }: { siteId: string }) {
  const { data: profile } = useProfile(siteId);
  const save = useSaveProfile(siteId);
  const [services, setServices] = useState<string | null>(null);
  const [locations, setLocations] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [local, setLocal] = useState<boolean | null>(null);

  const servicesVal = services ?? (profile?.services ?? []).join('\n');
  const locationsVal = locations ?? (profile?.locations ?? []).join(', ');
  const summaryVal = summary ?? profile?.summary ?? '';
  const countryVal = country ?? profile?.geoCountry ?? 'RO';
  const languageVal = language ?? profile?.geoLanguage ?? 'ro';
  const cityVal = city ?? profile?.primaryCity ?? '';
  const localVal = local ?? profile?.localEmphasis ?? false;

  return (
    <Card>
      <SectionTitle>Profilul afacerii</SectionTitle>
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Pe baza asta găsim cuvintele cheie potrivite. Cu cât e mai exact, cu atât e mai bună
        strategia.
      </p>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-[var(--text-muted)]">Servicii (unul pe linie)</span>
          <textarea
            rows={4}
            value={servicesVal}
            onChange={(e) => setServices(e.target.value)}
            className={`mt-1 ${inputCls}`}
          />
        </label>
        <label className="block">
          <span className="text-[var(--text-muted)]">Zone / orașe (virgulă)</span>
          <input
            value={locationsVal}
            onChange={(e) => setLocations(e.target.value)}
            className={`mt-1 ${inputCls}`}
          />
        </label>
        <label className="block">
          <span className="text-[var(--text-muted)]">O frază despre afacere</span>
          <input
            value={summaryVal}
            onChange={(e) => setSummary(e.target.value)}
            className={`mt-1 ${inputCls}`}
          />
        </label>

        <div className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Piață țintă
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[var(--text-muted)]">Țară (cod)</span>
              <input value={countryVal} onChange={(e) => setCountry(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-[var(--text-muted)]">Limbă (cod)</span>
              <input value={languageVal} onChange={(e) => setLanguage(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
          </div>

          <div className="mt-3">
            <span className="text-[var(--text-muted)]">Tip de SEO</span>
            <div className="mt-1 inline-flex rounded-[var(--radius-sm)] border border-[var(--border-strong)] p-0.5">
              <button
                type="button"
                onClick={() => setLocal(false)}
                className={`rounded-[calc(var(--radius-sm)-2px)] px-3 py-1.5 text-sm ${
                  !localVal ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)]'
                }`}
              >
                Național — toată țara
              </button>
              <button
                type="button"
                onClick={() => setLocal(true)}
                className={`rounded-[calc(var(--radius-sm)-2px)] px-3 py-1.5 text-sm ${
                  localVal ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)]'
                }`}
              >
                Local — un oraș
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {localVal ? (
                <>
                  Recomandări de SEO local: homepage-ul și paginile de servicii țintesc și varianta
                  „… {cityVal || 'oraș'}”, primesc schema LocalBusiness (nume, adresă, telefon) și
                  apar sarcini pentru Google Business Profile. Alege asta doar dacă ai o locație
                  fizică sau servești un singur oraș.
                </>
              ) : (
                <>
                  Potrivit pentru o agenție sau o afacere online care vrea trafic din toată țara.
                  Fără schema LocalBusiness, fără „oraș” forțat în titluri, fără sarcini de Business
                  Profile.
                </>
              )}
            </p>
          </div>

          {localVal && (
            <label className="mt-3 block">
              <span className="text-[var(--text-muted)]">Oraș principal</span>
              <input
                value={cityVal}
                onChange={(e) => setCity(e.target.value)}
                placeholder="ex. București"
                className={`mt-1 ${inputCls}`}
              />
            </label>
          )}
        </div>

        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              summary: summaryVal,
              services: servicesVal.split('\n').map((s) => s.trim()).filter(Boolean),
              locations: locationsVal.split(',').map((s) => s.trim()).filter(Boolean),
              geoCountry: countryVal.trim() || undefined,
              geoLanguage: languageVal.trim() || undefined,
              primaryCity: localVal ? cityVal.trim() || null : null,
              localEmphasis: localVal,
              confirmed: true,
            })
          }
        >
          {save.isPending ? 'Se salvează…' : 'Salvează profilul'}
        </Button>
        {save.isSuccess && (
          <p className="text-[var(--good)]">
            Salvat. Apasă „Reconstruiește strategia” ca să reflecte schimbările.
          </p>
        )}
      </div>
    </Card>
  );
}

function BlogPublishCard({ siteId }: { siteId: string }) {
  const { data: profile } = useProfile(siteId);
  const save = useSaveProfile(siteId);
  const on = !!profile?.autoPublishBlog;
  return (
    <Card>
      <SectionTitle>Publicare articole de blog</SectionTitle>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ autoPublishBlog: e.target.checked })}
        />
        <span className="text-[var(--text-muted)]">
          <strong className="text-[var(--text)]">Publică automat articolele care trec toate verificările.</strong>{' '}
          Când lipești un articol și toate verificările (cuvinte cheie, link intern, structură,
          limbaj natural, fără promisiuni) sunt verzi, se publică <strong>live</strong> pe blog prin
          pluginul WordPress. Dacă e oprit, primești un buton „Publică pe blog” după verificare.
        </span>
      </label>
    </Card>
  );
}

function PlaybookCard({ siteId }: { siteId: string }) {
  const { data } = usePlaybook(siteId);
  const add = useAddRule(siteId);
  const update = useUpdateRule(siteId);
  const del = useDeleteRule(siteId);
  const [draft, setDraft] = useState('');

  const rules = data?.rules ?? [];

  return (
    <Card>
      <SectionTitle>Reguli învățate</SectionTitle>
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        De fiecare dată când corectezi o recomandare („Nu e bine — corectează” pe o pagină), regula
        se adaugă aici și agentul SEO o aplică la fiecare revizuire. Baza e în{' '}
        <code>seo-playbook.md</code>; astea sunt adăugirile tale.
      </p>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Scrie o regulă… ex. Nu propune schema FAQ pe pagini fără întrebări reale."
          className={inputCls}
        />
        <Button
          disabled={add.isPending || draft.trim().length < 5}
          onClick={() => add.mutate({ rule: draft.trim() }, { onSuccess: () => setDraft('') })}
        >
          Adaugă
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-faint)]">Nicio regulă învățată încă.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] p-2"
            >
              <div className={r.active ? '' : 'opacity-40 line-through'}>
                <div>{r.rule}</div>
                <div className="mt-0.5 text-xs text-[var(--text-faint)]">
                  {r.source === 'correction' ? 'din corectare' : r.source === 'manual' ? 'manual' : 'agent'}
                  {r.siteId ? '' : ' · toate site-urile'}
                  {r.rationale ? ` · „${r.rationale.slice(0, 80)}"` : ''}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className="text-xs text-[var(--text-muted)] underline"
                  onClick={() => update.mutate({ id: r.id, active: !r.active })}
                >
                  {r.active ? 'dezactivează' : 'activează'}
                </button>
                <button
                  className="text-xs text-[var(--bad)] underline"
                  onClick={() => del.mutate(r.id)}
                >
                  șterge
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WpConnect({ siteId }: { siteId: string }) {
  const connect = useConnectWordpress(siteId);
  const [wpSiteUrl, setWpSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [applicationPassword, setApplicationPassword] = useState('');

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        connect.mutate({ wpSiteUrl, username, applicationPassword });
      }}
    >
      <input
        required
        value={wpSiteUrl}
        onChange={(e) => setWpSiteUrl(e.target.value)}
        placeholder="https://site.tld"
        className={inputCls}
      />
      <input
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="utilizator WP"
        className={inputCls}
      />
      <input
        required
        type="password"
        value={applicationPassword}
        onChange={(e) => setApplicationPassword(e.target.value)}
        placeholder="Parolă de conectare"
        className={inputCls}
      />
      <Button type="submit" disabled={connect.isPending}>
        {connect.isPending ? 'Se testează…' : 'Conectează'}
      </Button>
      {connect.isError && <p className="text-sm text-[var(--bad)]">{(connect.error as Error).message}</p>}
      {connect.data?.ok && (
        <p className="text-sm text-[var(--good)]">
          Conectat{connect.data.seoPlugin ? ` · plugin SEO: ${connect.data.seoPlugin}` : ''}.
        </p>
      )}
    </form>
  );
}
