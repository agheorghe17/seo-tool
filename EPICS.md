# SEO Audit Platform — Plan de implementare

> Bifează `[x]` pe fiecare task după implementare.
> La finalul fiecărui epic: `git tag epic-N-<nume>` + `CHANGELOG-epic-N.md`.
> Fiecare epic are un criteriu **Gata când**. Vezi [ARCHITECTURE.md](./ARCHITECTURE.md) pentru context, model de date și constrângeri.

---

## Epic 0 — Setup monorepo, infra & auth

- [x] **0.1** Init Turborepo + pnpm workspaces, Node 22 (`.nvmrc`), `pnpm-workspace.yaml`, `turbo.json` (build/dev/lint/type-check), preset-uri `packages/config`
- [x] **0.2** Scaffold `apps/web` (Next.js 15 App Router) — Tailwind v4 + TanStack Query + componente UI proprii (fără shadcn); dashboard complet în Epic 8
- [x] **0.3** Scaffold `apps/api` (Fastify 5) — `index.ts`, `@fastify/cors`, `@fastify/jwt`, plugin de erori, healthcheck `/healthz`
- [x] **0.4** Scaffold `apps/worker` — bootstrap `pg-boss`, registru de handlere pe tip de job, graceful shutdown
- [x] **0.5** `packages/db` — Drizzle + client Postgres, config `drizzle.config.ts`, scripturi `generate` / `migrate` / `studio`
  - [x] **0.5.1** Schema inițială: `users`, `sites`, `site_secrets`, `crawls`, `pages`, `issues`, `recommendations`
  - [ ] **0.5.2** Prima migrație aplicată pe proiectul Supabase; policy-uri RLS pe tabelele cu `user_id` — *necesită credențiale Supabase*
- [x] **0.6** Auth Supabase — middleware API (`apps/api/src/middleware/auth.ts`, JWT → `userId`) + flux web (`@supabase/ssr`, `middleware.ts`, `/login`, `AuthProvider`)
- [x] **0.7** `packages/shared` — tipuri partajate (`Site`, `Crawl`, `Page`, `Issue`, `Recommendation`, `TrafficEstimate`) + enums
- [x] **0.8** Modul de cripto `encryptSecret` / `decryptSecret` (AES-256-GCM, `ENCRYPTION_KEY`) în `packages/shared` + teste
- [x] **0.9** CI GitHub Actions — `lint`, `type-check`, `test`, `drizzle-kit` drift check pe PR
- [x] **0.10** Pipeline de deploy — `deploy/fly.api.toml`, `deploy/fly.worker.toml`, `Dockerfile.node`, `deploy/README.md` (Vercel + Fly + Supabase + Upstash), `.env.example` complet
- [x] **0.11** `CLAUDE.md` la rădăcină — comenzi, layout, convenții, variabile de mediu

**Gata când:** un utilizator se înregistrează, se autentifică și creează un `site` gol în DB; `pnpm dev` pornește web+api+worker; CI trece; deploy-ul de staging răspunde la `/healthz`.

---

## Epic 1 — Conectare site & verificare proprietate

- [x] **1.1** `POST /api/sites` — adaugă site (`connection_type`), normalizează domeniul, împiedică duplicate per user
- [x] **1.2** Verificare universală — generează `verification_token`; suportă 3 metode (`apps/api/src/lib/verification.ts`):
  - [x] **1.2.1** Meta tag în `<head>` (`<meta name="seo-tool-verification" content="...">`)
  - [x] **1.2.2** Fișier HTML la `/{token}.html`
  - [x] **1.2.3** Înregistrare DNS TXT (`seo-tool-verification=...`) — lookup cu `node:dns`
- [x] **1.3** `POST /api/sites/:id/verify` — rulează metoda aleasă, setează `verified_at`, mesaje de eroare clare
- [x] **1.4** Conectare WordPress — `POST /api/sites/:id/wordpress`; testează `GET /wp-json/wp/v2/users/me` + `/types`
  - [x] **1.4.1** Criptează Application Password în `site_secrets` (kind `wp_app_password`)
  - [x] **1.4.2** Detectează pluginul SEO activ (Yoast / RankMath) din `/wp-json/wp/v2/plugins`
- [ ] **1.5** UI onboarding site — pași ghidați per metodă, stare „verificat / neverificat”, re-verificare — *amânat la Epic 8 (are nevoie de shell-ul de UI + auth)*
- [x] **1.6** `GET /api/sites` + `GET /api/sites/:id` — cu status conexiune și ultimul crawl

**Gata când:** un site universal poate fi verificat prin oricare din cele 3 metode; un site WordPress conectat întoarce lista de tipuri de conținut și pluginul SEO detectat. *Backend + logică pură + teste: gata (10 teste). UI: 1.5.*

---

## Epic 2 — Crawler & extractor (fetch static)

- [x] **2.1** `packages/crawler` — descoperire URL-uri:
  - [x] **2.1.1** Parsare `sitemap.xml` + sitemap index imbricat (recursiv), `<lastmod>` reținut (`src/sitemap.ts`)
  - [x] **2.1.2** Fallback fără sitemap: crawling BFS pe linkuri interne pornind de la homepage (`src/crawl.ts` `bfsDiscover`)
  - [x] **2.1.3** Parsare `robots.txt` — disallow rules + `crawl-delay` (`src/robots.ts`)
- [~] **2.2** Rate limiter per domeniu — token bucket in-memory (`src/ratelimit.ts`); varianta Redis pentru instanțe multiple: Epic 9
- [x] **2.3** Fetch static cu `undici` (pool de concurență, timeout, urmărire redirect manuală → `redirect_chain_json`) (`src/fetch.ts`)
- [x] **2.4** Extractor HTML (`cheerio`) — title, meta, headings, word_count din conținut principal, images (src+alt), linkuri interne/externe, canonical, JSON-LD `@type` (+`@graph`), `indexability` din `meta robots` + `X-Robots-Tag` (`src/extract.ts`)
- [x] **2.5** `content_hash` (sha256 pe conținutul principal normalizat, case-insensitive)
- [x] **2.6** Job `crawl` în `pg-boss` (`apps/worker/src/jobs/crawl.ts`) — `POST /api/sites/:id/crawls` pune jobul, întoarce `crawl_id` (202)
- [x] **2.7** Progres incremental — `crawls.pages_scanned` flush la fiecare 5 pagini + `GET /api/crawls/:id` cu `progressPct`
- [~] **2.8** Limită `CRAWL_MAX_PAGES` (implicit 2000) aplicată în crawler; avertismentul + restrângerea pe secțiune în UI: Epic 8
- [x] **2.9** Semnal „JS-heavy” (`looksJsHeavy`) → sub-job `render` pus în coadă
- [x] **2.10** Erori per pagină (timeout, 5xx, non-HTML) fără a pica crawl-ul; evenimente `error`/`skipped`; `crawls.status = partial`

**Gata când:** introduci un URL public, primești o listă de pagini cu date brute extrase; sitemap index imbricat funcționează; `robots.txt` disallow este respectat; progresul crește vizibil. *`packages/crawler` + job worker + endpoints: gata (22 teste crawler). Integrare DB end-to-end: necesită Postgres.*

---

## Epic 3 — Render JS + date de viteză

- [x] **3.1** Renderer Playwright (`packages/crawler/src/render.ts`) — `playwright-core` ca dep opțională, lazy-import, browser reutilizat
  - [x] **3.1.1** Sub-job `render` (`apps/worker/src/jobs/render.ts`) — HTML randat → re-extragere `PageData`, `rendered_with='playwright'`
  - [x] **3.1.2** Limite: timeout hard, blocare `image`/`media`/`font`, un singur `browser` cache-uit
  - [x] **3.1.3** **Cale $0**: `RENDER_ENABLED != 1` sau `RenderUnavailableError` → păstrează extragerea statică + issue `technical.needs-ssr`
- [x] **3.2** `connectors/psi` — PageSpeed Insights (mobil + desktop), field → lab fallback, timeout, fetch injectabil
- [x] **3.3** `connectors/crux` — CrUX API (p75), `null` când nu există date de câmp
- [x] **3.4** Cache pe răspunsuri PSI/CrUX — `CacheStore` (`MemoryCacheStore` + `RedisCacheStore` via `ioredis` în worker), `withCache`, TTL 48h implicit
- [x] **3.5** Job `enrich` — `mergeCwv` (CrUX → PSI field → PSI lab) completează `lcp_ms`/`inp_ms`/`cls_score`/`mobile_friendly`, apoi pune `score`
- [x] **3.6** Fallback lab data când CrUX e gol — marcat prin `source` (`field`/`lab`/`none`)

**Gata când:** fiecare pagină din crawl are LCP/INP/CLS din PSI/CrUX (sau lab data marcat explicit ca atare), iar paginile JS-heavy sunt fie randate, fie semnalate clar. *Connectors + jobs + `mergeCwv`: gata (13 teste). Render real: necesită Chromium instalat (`RENDER_ENABLED=1`).*

---

## Epic 4 — Motor de scoring SEO

- [x] **4.1** `packages/scoring` — contract `Rule { id, version, category, severity, fixTitle, impactHint, effortHint, penalty, check(page, ctx) }` (`src/rule.ts`)
- [x] **4.2** Reguli **Tehnic** (`rules/technical.ts`): status 200, HTTPS, fără lanț de redirect-uri, `noindex`, canonical aliniat, conținut duplicat (`content_hash` pe siblings). Sitemap/robots la nivel de site → `scoreSite`
- [x] **4.3** Reguli **CWV** (`rules/cwv.ts`): LCP < 2.5s, INP < 200ms, CLS < 0.1, mobile-friendly (metrică `null` = neevaluat)
- [x] **4.4** Reguli **On-page** (`rules/onpage.ts`): title 30-60, meta 120-160, un singur H1, alt text, ierarhie de headings
- [x] **4.5** Reguli **Conținut** (`rules/content.ts`): thin content (< 250 cuvinte), title duplicat, canibalizare pe H1
- [x] **4.6** Reguli **GEO** (`rules/geo.ts`): schema prezent, schemă orientată pe răspuns (Article/FAQ/HowTo), conținut scanabil (H2/H3)
- [x] **4.7** Agregare — `scorePage` (medie ponderată a categoriilor, fiecare 100 − Σ penalizări) + `scoreSite` (medie pagini − penalizare site-level pentru HTTPS/sitemap/robots)
- [x] **4.8** Ponderi **configurabile** — `loadWeights` + `weightsSchema` (Zod), din `SCORING_WEIGHTS`; fallback la `DEFAULT_WEIGHTS`
- [x] **4.9** Job `score` (`apps/worker/src/jobs/score.ts`) — populează `score_*` pe `pages`, re-inserează `issues` idempotent, pune `recommend`
- [x] **4.10** Teste pe fixture-uri (pagină curată / status 404 / http / redirecturi / noindex / duplicate / CWV proaste / thin / fără schema / scoreSite / loadWeights) — 12 teste

**Gata când:** un crawl produce scor total + breakdown pe 5 categorii per pagină și per site, reproductibil, cu teste care fixează comportamentul fiecărei reguli. *`packages/scoring` + job: gata. Persistarea scorului de site pe `crawls`: Epic 8/9.*

---

## Epic 5 — Motor de recomandări + strat LLM

- [x] **5.1** Catalog `issue → fix` (`packages/scoring/src/catalog.ts`) — `fixTitle` + pași + `impactHint`/`effortHint` derivate din reguli, deterministe
- [x] **5.2** Scor de prioritate — `prioritise` (`packages/shared`, impact²/efort, critic float) → `priority_rank` pe tot crawl-ul
- [x] **5.3** `packages/llm` — `explain(structuredIssue): Promise<{ text, steps }>`
  - [x] **5.3.1** Adaptor `anthropic` — `@anthropic-ai/sdk` lazy, prompt strict (system în `prompt.ts`), temp 0, `ANTHROPIC_MAX_TOKENS`, model implicit Haiku
  - [x] **5.3.2** Adaptor `ollama` — `POST /api/chat` cu `format: json`, temp 0
  - [x] **5.3.3** Adaptor `none` — întoarce `catalogSteps`, fără LLM
  - [x] **5.3.4** `LLM_PROVIDER` + cache pe `(ruleId, ruleVersion, detectedValue)` prin `LlmCache` (Redis în worker), TTL `LLM_CACHE_TTL_SECONDS`
- [x] **5.4** Job `recommend` (`apps/worker/src/jobs/recommend.ts`) — mapare la fix, prioritizare pe crawl, `explainIssue` cu pool, insert `recommendations` (idempotent), pune `estimate`
- [x] **5.5** `auto_fixable` din `AUTO_FIXABLE_RULES` (title, meta description, alt text, schema)
- [x] **5.6** Guardrail anti-halucinație (`guardrail.ts`) — respinge cifre/URL-uri absente din input; `explainIssue` cade pe catalog dacă pică sau adaptorul aruncă

**Gata când:** fiecare issue are un fix concret + explicație (sau template dacă `LLM_PROVIDER=none`), prioritizat, cu `auto_fixable` corect. *`packages/scoring` catalog + `packages/llm` + job: gata (7 teste llm, 4 catalog).*

---

## Epic 6 — Conector WordPress (citire + auto-fix)

- [x] **6.1** `connectors/wordpress` — client REST cu Application Password (Basic auth), `wpGet`/`wpPatch`
- [~] **6.2** Citire conținut — `resolveObject` + plugin-uri active; listarea completă posts/media: în Epic 8 la nevoie
- [x] **6.3** `resolveObject(creds, url)` — mapare URL → obiect WP prin slug (posts apoi pages)
- [x] **6.4** Scriere fix-uri sigure (`applyFix`):
  - [x] **6.4.1** Meta title / description — chei per plugin (`metaKeysFor`: Yoast / RankMath / fallback `_seo_tool_*`), `POST /wp/v2/{type}s/{id}` cu `meta`
  - [x] **6.4.2** Alt text — `POST /wp/v2/media/:id` cu `alt_text`
  - [~] **6.4.3** Schema markup — chei `_seo_tool_*` există; injectarea în `wp_head` cere mu-plugin companion (documentat, nelivrat)
- [x] **6.5** `POST /api/recommendations/:id/apply` — validează `auto_fixable` + WP conectat, aplică, salvează `applied`/`applied_at`/`applied_result_json`
- [x] **6.6** Rollback — `POST /api/recommendations/:id/rollback` + `rollbackFix` din `applied_result_json.previous`
- [ ] **6.7** Sincronizare periodică (polling / webhook) — Epic 9/12

**Gata când:** un site WordPress conectat primește un fix `auto_fixable` aplicat cu confirmare, cu valoarea veche păstrată pentru rollback. *`connectors/wordpress` + endpoints: gata (8 teste, apply+rollback pe fixture server). Bulk apply + schema injection: rămân.*

---

## Epic 7 — Estimator de trafic (componenta cea mai sensibilă)

- [x] **7.1** OAuth GSC — `POST /api/sites/:id/gsc/connect` (→ authUrl), `GET /api/sites/gsc/callback` (exchange → refresh token criptat în `site_secrets`), `connectors/gsc.ts`
- [x] **7.2** Import baseline GSC — `fetchSearchAnalytics` (page dim, 90 zile) → `totalClicks` / 3 = medie lunară (job `estimate`)
- [x] **7.3** Fallback fără GSC — `keywordBaseline`: Σ `estimatedClicks(volum, poziție)` din `keyword_data` folosind curbele CTR din `packages/shared/ctr.ts`
  - [~] **7.3.1** Sursă keywords v1 = GSC/`keyword_data`; DataForSEO rămâne în spatele `dataForSeoEnabled()` (neimplementat)
- [x] **7.4** Model de impact — `packages/estimator/impact.ts`: `CATEGORY_UPLIFT` (interval low/mid/high conservator per categorie) × saturație × headroom
- [x] **7.5** Ramp-up — `rampFraction` (luna 1-2 ~0, logistic până la orizont) + `assertNoUnrealisticGrowth` (aruncă la >2× lună-la-lună)
- [x] **7.6** Output — `estimateTraffic` întoarce mereu `estimateLow/Mid/High` + `series[]` + `confidenceLevel` (gsc ⇒ medium, altfel low) + `assumptions[]` populat
- [x] **7.7** Job `estimate` (`apps/worker/src/jobs/estimate.ts`) → tabel `traffic_estimates`; `GET`/`POST /api/sites/:id/traffic-estimate`
- [x] **7.8** Teste (9) — low≤mid≤high, `assumptions.length≥5`, high ≤ 2× baseline (≤1.6× fără GSC), fără cheie `estimate`/`guaranteed`, `assertNoUnrealisticGrowth` aruncă pe salt >2×

**Gata când:** estimarea e întotdeauna un interval cu asumpții vizibile și nivel de încredere; nu există cale de cod care produce un număr fix „garantat”. *`packages/estimator` + job + tabel + endpoints: gata.*

---

## Epic 8 — Dashboard / Frontend

- [x] **8.1** `sites/new` — domeniu + tip conexiune; `sites/[siteId]` — verificare (3 metode + token), WP connect, GSC connect, „Pornește crawl”
- [x] **8.2** `CrawlProgress` — subscribe Supabase Realtime pe rândul `crawls` + fallback polling (react-query `refetchInterval` 2s), bară `pages_scanned/pages_total`
- [x] **8.3** `ScoreBreakdown` — scor total + 5 bare pe categorii; `GET /api/crawls/:id/summary` (medii + counts pe severitate)
- [x] **8.4** `PagesTable` — sortabil (scor/URL/cuvinte), filtru pe URL, drill-down `pages/[pageId]`
- [x] **8.5** `pages/[pageId]` — carduri scoruri + meta CWV + issues grupate pe severitate cu `detectedValue`
- [x] **8.6** Recomandări în `pages/[pageId]` — `RecommendationCard` prioritizat, explicație LLM, „Aplică automat” (WP + `auto_fixable`, formular meta/alt) + „Anulează fix-ul”. Bulk: rămâne
- [x] **8.7** `TrafficBandChart` — SVG cu **bandă min-max** + linie mijloc + serie lunară + badge încredere + disclaimer + asumpții (nu linie unică)
- [x] **8.8** Export — CSV per crawl (client-side) + `crawls/[crawlId]/report` imprimabil (`window.print` → PDF din browser)
- [x] **8.9** `Skeleton` / `EmptyState` / `ErrorState` folosite pe fiecare pagină
- [x] Auth Supabase (Epic 0.6) — `@supabase/ssr`, `middleware.ts` (refresh sesiune + guard rute), `/login` (email+parolă), `AuthProvider` (token pentru API)

**Gata când:** un utilizator pornește un crawl, vede progresul live, apoi scorul, paginile, issues, recomandările și estimarea (ca interval), și poate exporta un raport. *UI complet + auth; `web build` OK. Necesită credențiale Supabase pentru rulare.*

---

## Epic 9 — Coadă de joburi & fiabilitate

- [ ] **9.1** `pg-boss` — definire cozi per tip (`crawl`, `render`, `enrich`, `score`, `recommend`, `estimate`, `wp-apply`), concurență per tip
- [ ] **9.2** Retry cu backoff exponențial + dead-letter; `job_runs` ca audit
- [ ] **9.3** Orchestrare pipeline — la finalul unui job se pune automat următorul (`crawl` → `enrich` → `score` → `recommend` → `estimate`)
- [ ] **9.4** Idempotență — re-rularea unui job nu dublează pagini/issues (upsert pe `(crawl_id, url)` / `(page_id, rule_id)`)
- [ ] **9.5** Anulare crawl — `DELETE /api/crawls/:id` marchează `failed` și oprește joburile în așteptare
- [ ] **9.6** Timeout global per crawl + cleanup de joburi orfane

**Gata când:** un crawl complet rulează prin tot pipeline-ul fără intervenție; un job picat se reia; re-rularea nu produce duplicate.

---

## Epic 10 — Multi-tenant, planuri & rate limiting (pregătire comercială)

- [ ] **10.1** RLS verificat pe toate tabelele cu `user_id` (teste de izolare: user A nu vede datele lui B)
- [ ] **10.2** Câmpuri de plan pe `users` (`plan`, `quota_pages_month`, `quota_used`) + reset lunar
- [ ] **10.3** Enforcement cote — crawl refuzat / trunchiat când se depășește cota; mesaj clar în UI
- [ ] **10.4** Rate limiting API per user (token bucket Redis) pe endpoint-urile scumpe (`crawls`, `apply`)
- [ ] **10.5** Feature flags (`FEATURE_DATAFORSEO`, `LLM_PROVIDER`, limite de pagini) centralizate
- [ ] **10.6** Audit log pe acțiuni sensibile (conectare site, aplicare fix, conectare GSC)

**Gata când:** un al doilea utilizator de test are date complet izolate; depășirea cotei oprește crawl-ul cu mesaj; flag-urile schimbă comportamentul fără redeploy de cod.

---

## Epic 11 — Observabilitate, securitate & conformitate

- [ ] **11.1** Sentry în api + worker + web; logging structurat `pino` cu `crawl_id` / `site_id` în context
- [ ] **11.2** Validare Zod pe toate intrările API; sanitizare URL-uri (blochează IP-uri interne / SSRF în crawler)
- [ ] **11.3** Rotire / management `ENCRYPTION_KEY`; verificare că secretele nu apar în loguri
- [ ] **11.4** Politici de retenție — ștergere crawl-uri vechi (păstrează ultimele N per site) pentru a rămâne în 500 MB Supabase free
- [ ] **11.5** GDPR minim — export date user, ștergere cont (cascade), pagină de privacy
- [ ] **11.6** Health / readiness endpoints + alertă simplă (Sentry) când worker-ul e blocat
- [ ] **11.7** Dashboard intern de cost — număr apeluri PSI/CrUX/LLM per audit, ca să vezi când depășești free tiers

**Gata când:** un crawl pe un domeniu ostil (redirecturi, IP intern, HTML uriaș) nu compromite serverul; ștergerea contului elimină toate datele; costul per audit e vizibil.

---

## Epic 12 — Polish & schelet de monetizare

- [ ] **12.1** Onboarding ghidat (primul site, prima verificare, primul crawl)
- [ ] **12.2** Pagină de pricing + comparație planuri (Free / Pro) — fără plată încă, doar UI
- [ ] **12.3** Placeholder de billing (Stripe) izolat în spatele unui flag, neactivat
- [ ] **12.4** Rapoarte cu branding (logo + culori) pentru uz de agenție
- [ ] **12.5** Email tranzacțional minim (crawl terminat) — Resend free tier sau Supabase
- [ ] **12.6** Documentație utilizator (cum verifici proprietatea, cum conectezi WP, cum citești estimarea)

**Gata când:** un utilizator nou parcurge onboarding-ul până la primul raport fără ajutor; pagina de pricing există; billing-ul e pregătit dar oprit.

---

## Ordinea de execuție & dependențe

```
Epic 0 ──┬─► Epic 1 ──► Epic 2 ──► Epic 3 ──► Epic 4 ──► Epic 5 ──► Epic 6
         │                 ▲                     │           │
         └─► Epic 9 ───────┘                     └─► Epic 7 ◄─┘  (7 are nevoie și de GSC din Epic 1)
                                                     │
Epic 8 începe după Epic 2 (afișează date brute) și se completează pe măsură ce 4/5/7 livrează.
Epic 10 / 11 sunt transversale — schelet devreme (RLS, Zod, Sentry în Epic 0-2), finalizare înainte de „comercial”.
Epic 12 la final.
```

Traseu critic: **0 → 9 → 2 → 3 → 4 → 5**. Epic 1 poate merge în paralel cu 9. Epic 6 și 7 se ramifică din 5/4.
