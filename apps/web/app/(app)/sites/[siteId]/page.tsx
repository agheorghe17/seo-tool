'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useConnectGsc,
  useConnectWordpress,
  useCrawlSummary,
  useRecomputeEstimate,
  useSite,
  useStartCrawl,
  useTrafficEstimate,
  useVerifySite,
} from '@/lib/queries';
import { CrawlProgress } from '@/components/CrawlProgress';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { TrafficBandChart } from '@/components/TrafficBandChart';
import { Badge, Button, Card, ErrorState, PageHeading, Skeleton } from '@/components/ui';

const METHODS = [
  { id: 'meta_tag', label: 'Meta tag', how: (t: string) => `<meta name="seo-tool-verification" content="${t}">` },
  { id: 'html_file', label: 'Fișier HTML', how: (t: string) => `Urcă un fișier /${t}.html care conține exact: ${t}` },
  { id: 'dns_txt', label: 'DNS TXT', how: (t: string) => `Înregistrare TXT: seo-tool-verification=${t}` },
];

export default function SitePage() {
  const siteId = useParams().siteId as string;
  const { data: site, isLoading, error } = useSite(siteId);
  const verify = useVerifySite(siteId);
  const startCrawl = useStartCrawl(siteId);
  const connectGsc = useConnectGsc(siteId);
  const estimate = useTrafficEstimate(siteId);
  const recompute = useRecomputeEstimate(siteId);
  const summary = useCrawlSummary(site?.lastCrawl?.id);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorState error={error} />;
  if (!site) return null;

  return (
    <div className="space-y-6">
      <PageHeading
        title={site.domain}
        subtitle={site.connectionType === 'wordpress' ? 'WordPress conectat' : 'Site universal'}
        actions={
          site.verified || site.wpSiteUrl ? (
            <Button
              disabled={startCrawl.isPending || site.lastCrawl?.status === 'running'}
              onClick={() => startCrawl.mutate()}
            >
              {site.lastCrawl?.status === 'running' ? 'Crawl în curs…' : 'Pornește crawl'}
            </Button>
          ) : null
        }
      />

      {(startCrawl.isError || verify.isError) && (
        <p className="text-sm text-red-600">
          {((startCrawl.error ?? verify.error) as Error).message}
        </p>
      )}

      {!site.verified && !site.wpSiteUrl && (
        <Card>
          <h2 className="font-medium">Verifică proprietatea</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Alege o metodă, aplic-o pe site, apoi apasă „Verifică”. Token:
          </p>
          <code className="mt-2 block break-all rounded-lg bg-neutral-100 p-2 text-xs dark:bg-neutral-800">
            {site.verificationToken}
          </code>
          <div className="mt-4 space-y-3">
            {METHODS.map((m) => (
              <div key={m.id} className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <strong>{m.label}</strong>
                  <Button variant="ghost" onClick={() => verify.mutate(m.id)}>
                    Verifică
                  </Button>
                </div>
                <p className="mt-1 break-all text-xs text-neutral-500">{m.how(site.verificationToken)}</p>
              </div>
            ))}
          </div>
          {verify.data && !verify.data.verified && (
            <p className="mt-3 text-sm text-amber-600">{verify.data.reason}</p>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">WordPress</h2>
          {site.wpSiteUrl ? <Badge tone="good">conectat</Badge> : <Badge tone="neutral">neconectat</Badge>}
        </div>
        {site.wpSiteUrl ? (
          <p className="mt-1 text-sm text-neutral-500">
            Conectat la <code>{site.wpSiteUrl}</code>. Recomandările marcate ca auto-fixabile pot
            fi aplicate direct pe site din pagina fiecărei pagini.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-500">
              Conectează prin Application Password (recomandat: instalează pluginul SEO Audit
              Connector și generează parola din Setări &rarr; SEO Audit).
            </p>
            <div className="mt-3">
              <WpConnect siteId={siteId} />
            </div>
          </>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Google Search Console</h2>
          {site.gscConnected ? (
            <Badge tone="good">conectat</Badge>
          ) : (
            <Button variant="ghost" onClick={() => connectGsc.mutate(undefined)}>
              Conectează
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Conectat = baseline de trafic din date reale și încredere mai mare a estimării.
        </p>
        {connectGsc.isError && (
          <p className="mt-2 text-sm text-amber-600">
            {(connectGsc.error as Error).message.includes('GOOGLE_OAUTH')
              ? 'Google OAuth nu e configurat (GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REDIRECT_URI în .env). Opțional — estimarea merge și fără GSC, cu încredere „low".'
              : (connectGsc.error as Error).message}
          </p>
        )}
      </Card>

      {site.lastCrawl && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Ultimul crawl</h2>
            <Link href={`/crawls/${site.lastCrawl.id}`} className="text-sm text-neutral-500 hover:underline">
              detalii →
            </Link>
          </div>
          <CrawlProgress crawlId={site.lastCrawl.id} />
          {summary.data && summary.data.pages > 0 && (
            <div className="mt-5">
              <ScoreBreakdown summary={summary.data} />
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Estimare trafic</h2>
          <Button variant="ghost" onClick={() => recompute.mutate()}>
            Recalculează
          </Button>
        </div>
        {estimate.isLoading && <Skeleton className="h-40 w-full" />}
        {estimate.data ? (
          <TrafficBandChart estimate={estimate.data} />
        ) : (
          <p className="text-sm text-neutral-500">
            Nicio estimare încă. Rulează un crawl complet, apoi „Recalculează”.
          </p>
        )}
      </Card>
    </div>
  );
}

function WpConnect({ siteId }: { siteId: string }) {
  const connect = useConnectWordpress(siteId);
  const [wpSiteUrl, setWpSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [applicationPassword, setApplicationPassword] = useState('');

  return (
    <div>
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
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="utilizator WP"
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
        <input
          required
          type="password"
          value={applicationPassword}
          onChange={(e) => setApplicationPassword(e.target.value)}
          placeholder="Application Password"
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        />
        <Button type="submit" disabled={connect.isPending}>
          {connect.isPending ? 'Se testează…' : 'Conectează'}
        </Button>
        {connect.isError && <p className="text-sm text-red-600">{(connect.error as Error).message}</p>}
        {connect.data?.ok && (
          <p className="text-sm text-emerald-600">
            Conectat{connect.data.seoPlugin ? ` · plugin SEO: ${connect.data.seoPlugin}` : ''}.
          </p>
        )}
      </form>
    </div>
  );
}
