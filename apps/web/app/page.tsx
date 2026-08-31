export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">SEO Audit Platform</h1>
      <p className="mt-3 text-neutral-500">
        Scaffold Epic 0. Dashboard-ul (Epic 8) se construiește aici: start crawl, progres live,
        scor, recomandări, estimare de trafic.
      </p>
      <ul className="mt-8 space-y-2 text-sm text-neutral-500">
        <li>
          API health: <code>{process.env.NEXT_PUBLIC_API_BASE_URL}/healthz</code>
        </li>
        <li>
          Plan: vezi <code>EPICS.md</code> la rădăcina repo-ului.
        </li>
      </ul>
    </main>
  );
}
