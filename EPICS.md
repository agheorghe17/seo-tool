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

- [x] **9.1** `pg-boss` — cozi per tip cu `concurrency` (crawl 2, render 1, enrich/score 4, recommend/estimate/wp-apply 2)
- [x] **9.2** Retry cu backoff exponențial (`JOB_SEND_OPTIONS`: retryLimit 3, retryDelay 30, retryBackoff) + `expireInSeconds`; tabel `job_runs` (running/ok/failed + durată) în jurul fiecărui handler
- [x] **9.3** Orchestrare — `sendNext(boss, ...)` la finalul fiecărui job continuă pipeline-ul cu aceleași opțiuni de retry
- [x] **9.4** Idempotență — upsert `(crawl_id, url)` pe `pages`; `issues`/`recommendations` șterse+reinserate per crawl; `job_runs` doar log
- [x] **9.5** Anulare — `DELETE /api/crawls/:id` (status `failed`); `handleCrawl` recitește statusul la fiecare flush și se oprește dacă nu mai e `running`
- [x] **9.6** `sweepStaleCrawls` la pornirea worker-ului + la fiecare oră (crawls `running`/`queued` mai vechi de 3h → `failed`)

**Gata când:** un crawl complet rulează prin tot pipeline-ul fără intervenție; un job picat se reia; re-rularea nu produce duplicate. *Implementat; verificarea end-to-end necesită Postgres + worker rulând.*

---

## Epic 10 — Multi-tenant, planuri & rate limiting (pregătire comercială)

- [~] **10.1** RLS — `packages/db/sql/policies.sql` (RLS enabled + policy `owner` pe toate tabelele, `site_secrets`/`job_runs` = deny-all pentru anon, `crawls` în publicația Realtime); `pnpm --filter db policies`. Notă: API/worker se conectează direct ca owner și ocolesc RLS (verificarea de proprietate e în cod). Teste de izolare: necesită PG
- [x] **10.2** Câmpuri plan pe `users` (deja în schemă); `GET /api/me` + `GET /api/me/usage`. Reset lunar: necesită cron (Epic `schedule`)
- [x] **10.3** Enforcement cotă — `POST /api/sites/:id/crawls` → 429 dacă `quotaUsed >= quotaPagesMonth`; `handleCrawl` incrementează `quotaUsed` cu paginile scanate la final
- [x] **10.4** Rate limiting — `@fastify/rate-limit` global (240/min, cheie = `userId` sau IP); `healthz`/`readyz` exceptate. In-memory; store Redis pentru instanțe multiple
- [x] **10.5** Feature flags centralizate — `packages/shared/src/flags.ts` `readFlags()` (`FEATURE_DATAFORSEO`, `FEATURE_BILLING`, `RENDER_ENABLED`, `LLM_PROVIDER`, limite crawl)
- [x] **10.6** Audit log — tabel `audit_log` + `recordAudit()`; apelat pe `site.create`/`verify`/`wordpress.connect`/`gsc.connect`/`crawl.start`/`recommendation.apply`/`rollback`/`account.delete`

**Gata când:** un al doilea utilizator de test are date complet izolate; depășirea cotei oprește crawl-ul cu mesaj; flag-urile schimbă comportamentul fără redeploy de cod. *Cod complet; izolarea RLS se verifică cu PG.*

---

## Epic 11 — Observabilitate, securitate & conformitate

- [x] **11.1** Sentry opt-in (`SENTRY_DSN`) în api (`observability.ts`) + worker (`logger.ts`, `captureError` pe job failed); `pino` structurat
- [x] **11.2** Zod pe toate rutele API; SSRF în crawler (`ssrf.ts`, blochează IP-uri private/loopback/`.local`)
- [x] **11.3** Cripto AES-256-GCM (`packages/shared/crypto.ts`); `pino` `redact` pe `authorization`/`applicationPassword`/`refreshToken`/`ciphertext`/`*_API_KEY` în api + worker
- [x] **11.4** Retenție — `pruneOldCrawls` în job `estimate` (păstrează `RETAIN_CRAWLS_PER_SITE`, implicit 5; pages/issues/recos cascade)
- [x] **11.5** GDPR — `GET /api/me/export` (dump JSON), `DELETE /api/me` (cascade), pagina `/privacy` cu ambele butoane
- [x] **11.6** `GET /readyz` verifică DB (`select 1` → 503 la eșec); `sweepStaleCrawls` la pornire; Sentry pentru joburi blocate
- [x] **11.7** `GET /api/me/usage` — plan, cotă, crawl-uri luna asta, `job_runs` agregate pe tip/status

**Gata când:** un crawl pe un domeniu ostil (redirecturi, IP intern, HTML uriaș) nu compromite serverul; ștergerea contului elimină toate datele; costul per audit e vizibil. *Implementat.*

---

## Epic 12 — Polish & schelet de monetizare

- [~] **12.1** Onboarding — `EmptyState` pe `/sites` ghidează la primul site + verificare; wizard dedicat pe mai mulți pași: opțional ulterior
- [x] **12.2** `/pricing` — comparație Free / Pro (static, fără plată)
- [x] **12.3** Billing placeholder — `POST /api/billing/checkout` → 501 (flag off sau „not implemented”), în spatele `FEATURE_BILLING`
- [~] **12.4** Raport imprimabil arată domeniul + dată; logo/culori de brand configurabile: ulterior
- [x] **12.5** Email tranzacțional — `sendCrawlDoneEmail` (Resend HTTP API, no-op fără `RESEND_API_KEY`), apelat la finalul job-ului `estimate`
- [x] **12.6** `docs/USAGE.md` — flux complet (cont, verificare, WP, GSC, crawl, rezultate, estimare, export, date)

**Gata când:** un utilizator nou parcurge onboarding-ul până la primul raport fără ajutor; pagina de pricing există; billing-ul e pregătit dar oprit. *Livrat; wizard de onboarding și branding de raport rămân opționale.*

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

---
---

# Modul Strategie de Keywords & Competitori (Epics 13-19)

> Adăugat peste audit. Răspunde la: pe ce rankez, ce să țintesc pentru afacerea mea, unde stau
> față de competitori, ce fac în 30/60/90 zile. Explicat pentru cineva care nu știe SEO.
> Nimic nu cere un API plătit ca să funcționeze; SERP-ul plătit e strict opțional.

## Epic 13 — Profil de business & conectori de date
- [x] **13.1** Tabele `business_profiles`, `competitors`, `competitor_pages`, `keyword_clusters`, `rank_snapshots`, `serp_results`, `keyword_playbooks`, `roadmap_items` + coloane strategie pe `keyword_data` (intent, cluster_id, business_relevance, competition, opportunity_score, bucket, has_target_page, expansion_source, gl/hl); migrații `0002_strategy` + `0003_strategy_uq`; RLS „owner via site"
- [x] **13.2** `connectors/autocomplete.ts` — Google Suggest (fără cheie), `expandSeeds` cu drilling pe alfabet
- [x] **13.3** `connectors/keywordplanner.ts` — Google Ads `KeywordPlanIdeaService` (volum + competiție + idei); degradare grațioasă fără `GOOGLE_ADS_DEVELOPER_TOKEN`
- [x] **13.4** `connectors/serp/` — `SerpProvider` iface + `SERP_PROVIDER` env; adaptor `dataforseo` complet, schițe `serpapi`/`scaleserp`/`valueserp`; `none` implicit → SERP no-op
- [x] **13.5** Job `profile-extract` — LLM (sau euristic pe paginile crawl-uite) → `business_profiles` draft; `GET/PUT /api/sites/:id/profile`
- [x] **13.6** `POST/GET/DELETE /api/sites/:id/competitors` — adăugare manuală, normalizare domeniu, anti-duplicat; adăugarea pune un `competitor-crawl`
- **Gata când:** un site are profil editabil auto-populat + listă de competitori manuală. *Gata.*

## Epic 14 — Univers de cuvinte cheie
- [x] **14.1** `packages/strategy` (pur) + `intent.ts` (euristic RO/EN cu fold de diacritice → informational/commercial/transactional/navigational/local/unknown)
- [x] **14.2** `strategy/cluster.ts` — grupare pe topicuri (componente conexe pe token-uri semnificative, pillar = volum/lungime)
- [x] **14.3** `strategy/relevance.ts` — scor 0-100 relevanță keyword vs profil (overlap servicii/locații)
- [x] **14.4** Job `keyword-research` — seed-uri (LLM/euristic) → autocomplete + Keyword Planner + related SERP → intent + cluster + relevanță → `keyword_data` + `keyword_clusters`; pune `rank-import`
- [x] **14.5** `GET /api/sites/:id/keywords` cu filtre (cluster/bucket/intent/rank) + total + paginare
- **Gata când:** pentru „agenție marketing România" se generează câteva sute de cuvinte clasificate pe intenție/clustere. *Gata (291 kw / 40 clustere pe test real).*

## Epic 15 — Rankinguri reale (GSC) & poziționare
- [x] **15.1** `gsc.fetchSearchAnalytics` cu `dimensions:['query','page']`, 180 zile
- [x] **15.2** Job `rank-import` — GSC → `rank_snapshots` + `keyword_data.currentPosition`; **plus** matching keyword→pagină proprie prin similaritate (funcționează și fără GSC)
- [x] **15.3** `strategy/striking.ts` — poz 5-20 + impresii → `bucket='quick_win'`; detectare canibalizare (2+ pagini pe același query)
- [x] **15.4** `GET /api/keywords/:kwId/rank-history`
- **Gata când:** utilizatorul vede ce rankează, pe ce poziție și pe ce pagină + striking distance. *Gata; striking/quick_win necesită GSC conectat.*

## Epic 16 — Analiză competitori (crawl, fără API plătit)
- [x] **16.1** Job `competitor-crawl` — `crawlSite` refolosit (cap `COMPETITOR_CRAWL_MAX_PAGES`) → `competitor_pages` + `target_keyword_guess`; pune `strategy-build` (rescore)
- [x] **16.2** `strategy/target-keyword.ts` — ghicește keyword-ul țintă al unei pagini (title n-grams + slug + H1)
- [x] **16.3** `strategy/gap.ts` `clusterCoverage` — „ai N pagini / competitorul are M" per cluster
- [x] **16.4** `pageContentGap` — headings/word count/schema pe care competitorul le are și tu nu
- [x] **16.5** `GET /api/sites/:id/competitors/:cId/gap`
- **Gata când:** pe fiecare competitor adăugat, vezi pe ce clustere e mai puternic și ce-ți lipsește. *Gata.*

## Epic 17 — Scor de oportunitate & plan de acțiune ghidat
- [x] **17.1** `strategy/opportunity.ts` — `score = volum_norm × relevanță × achievability × page_factor`; volum `null` = necunoscut (neutru), nu „fără cerere"; bucketing quick_win / build_content / long_game care merge și fără date de poziție/volum
- [x] **17.2** `GET /api/sites/:id/opportunities` grupat pe bucket
- [x] **17.3** Job `strategy-build` — opportunity pe tot universul + content-gap + LLM → `keyword_playbooks` (brief + checklist specific per keyword) + `roadmap_items` 30/60/90; fallback determinist
- [x] **17.4** Prompturi stricte (fără promisiuni de poziție/trafic); test `strategy` blochează frazele „locul 1 garantat"
- [x] **17.5** `GET /api/sites/:id/roadmap` + `PATCH /api/roadmap/:itemId`; `GET /api/sites/:id/strategy/overview` (KPI)
- **Gata când:** fiecare cuvânt prioritar are playbook concret; roadmap 30/60/90 cu „de ce" simplu. *Gata (5 items / 15 playbooks pe test).*

## Epic 18 — Dashboard „Strategie" (UX pentru non-SEO)
- [x] **18.1** Rută `/(app)/sites/[siteId]/strategy` + link din pagina site-ului; `SeoTermTooltip` (glosar RO pe fiecare termen)
- [x] **18.2** `ProfileWizard` (prima dată) — confirmă servicii/orașe + adaugă competitori → rebuild
- [x] **18.3** Tab „Prezentare" — narativ în limbaj simplu + 4 KPI + „Următoarea acțiune"
- [x] **18.4** Tab „Cuvinte cheie" — tabel filtrabil (rank status / bucket) + `KeywordDetail` drawer (`RankHistoryChart`, top 10 SERP, playbook checklist)
- [x] **18.5** Tab „Oportunități" — board 3 coloane (câștig rapid / de creat conținut / termen lung)
- [x] **18.6** Tab „Competitori" — adăugare + tabel content-gap pe clustere
- [x] **18.7** Tab „Plan 30/60/90" — roadmap cu bife + „de ce contează"
- [x] **18.8** Stări goale ghidate
- **Gata când:** un om care nu știe SEO deschide „Strategie" și înțelege unde stă, ce să țintească, ce face săptămâna asta. *Gata; `web build` OK (12 rute).*

## Epic 19 — Tracking în timp & progres
- [x] **19.1** Job `rank-refresh` — `rank-import` + `serp-fetch` + `strategy-build` (rescore); raportează mișcările de poziție (urcat/coborât ≥ 2)
- [x] **19.2** `strategy-weekly` — job programat pg-boss (`RANK_REFRESH_CRON`, implicit luni 06:00) care face fan-out `rank-refresh` per site cu profil confirmat
- [~] **19.3** Digest lunar pe email — hook `sendCrawlDoneEmail` există; digest dedicat: de adăugat
- [x] **19.4** `RankHistoryChart` pe `KeywordDetail`; KPI „cuvinte în top 10" + trend pe Overview
- [x] **19.5** Progres roadmap — `roadmapDone/roadmapTotal` în overview + bife în UI
- **Gata când:** pozițiile se reîmprospătează automat săptămânal + evoluție vizibilă. *Gata; SERP-ul din tracking necesită `SERP_PROVIDER`.*

## Note de rulare (modul Strategie)
- Fără nimic în plus: universul se face din **autocomplete + matching pe paginile tale**; competitorii din **crawl**. Toate oportunitățile ies `build_content` (nu avem poziții) — corect și onest.
- **GSC conectat** → apar `quick_win` (striking distance), poziții reale, istoric.
- **`GOOGLE_ADS_DEVELOPER_TOKEN`** → volum de căutare pe cuvinte, prioritizare mai bună.
- **`SERP_PROVIDER=dataforseo|serpapi|…` + cheie** → poziții live față de competitori, „cine e în top 10".
- **`LLM_PROVIDER=anthropic|ollama`** → profil, briefuri și narativ mult mai bune (altfel: fallback determinist).

## Epic 20 — Redesign UX „pilot automat" (flux unificat + gamificare)

Un singur flux per site, inspirat de platformele „SEO fără să știi SEO" (Morningscore, Diib):
scor de sănătate + nivel/XP/streak, listă unică de sarcini în limbaj simplu (audit + cuvinte cheie
+ plan), navigație de 5 tab-uri.

- [x] **20.1** Design system — token-uri CSS (`globals.css`), `ui.tsx` extins: `Gauge`, `ProgressBar`,
  `Stat`, `Chip`, `Dots`, `Sheet`, `SectionTitle`, `CategoryTag`, `levelFromPoints`
- [x] **20.2** Shell — `Nav` (top bar „SEO Autopilot"), layout per-site `sites/[siteId]/layout.tsx`
  cu tab-uri: Acasă · Sarcini · Cuvinte cheie · Competitori · Setări
- [x] **20.3** API `GET /api/sites/:id/home` — scor + istoric + delta, categorii, gamificare
  (puncte = fix-uri aplicate + plan bifat; nivel + streak săptămânal derivate), KPI cuvinte,
  bandă de trafic, feed „ce s-a schimbat" (din `rank_snapshots`), „focus" + „next"
- [x] **20.4** API `GET /api/sites/:id/tasks` — listă unificată: fix-uri audit grupate pe `rule_id`
  (N pagini → 1 sarcină), oportunități de cuvinte cheie, `roadmap_items`; roadmap-ul cu `keyword_id`
  înlocuiește sarcina brută pe același cuvânt; sortare deschis→impact↓/efort↑
- [x] **20.5** Acasă — `Gauge` scor + sparkline istoric, card nivel/XP/streak, „Fă asta acum" (focus
  task + următorii pași), scor pe categorii, estimare trafic (interval, cu guard pe date lipsă),
  „ce s-a schimbat", nudge-uri de conectare
- [x] **20.6** Sarcini — `TaskCard` reutilizabil, chips de filtrare (câștiguri rapide / tehnic /
  pe pagină / conținut / AI / plan), bară de progres, bifare roadmap inline, drawer `KeywordDetail`
- [x] **20.7** Cuvinte cheie — gate `ProfileWizard`, strip KPI, chips rank-status, listă de carduri
  cu poziția mare, drawer detaliu (`?kw=` deschide direct din sarcini)
- [x] **20.8** Competitori — „unde te bate" în limbaj simplu (câte pagini au ei vs tine pe fiecare grup)
- [x] **20.9** Setări — verificare + WordPress + GSC + profil business + acțiuni (scanează / reconstruiește)
- [x] **20.10** `/sites/[siteId]/strategy` → redirect la `/keywords` (compat linkuri vechi)
- **Gata când:** type-check 12/12, lint curat, `web build` OK (16 rute), `/home` + `/tasks` verificate
  pe salesup.ro (scor 84, 69 sarcini, 10 din plan). *Screenshot vizual confirmat pe un preview local.*

## Epic 21 — „Autopilot" (model AYSA.ai, fără API plătit)

Pivot spre model de agent: „spune ce vrei → aprobă → gata". UI minimal (fără gamificare),
generare de conținut prin copy-paste în Claude-ul utilizatorului (zero cost API).

- [x] **21.1** DB `0004_autopilot` — tabel `content_drafts`; `sites.ga4_property` / `sites.gbp_location`;
  enum `secret_kind` += `ga4_refresh_token` / `gbp_refresh_token`; enum `content_status`; RLS `content_drafts`
- [x] **21.2** UI minimal — tab-uri `Autopilot · Aprobări · Conținut · Analiză · Setări`
  (`layout.tsx`); `page.tsx` rescris: casetă de comandă (rutare de intenție deterministă), 2 gauge
  (Sănătate + Vizibilitate AI) cu sparkline, „Ce se întâmplă acum", coada de aprobare, semnale.
  Scos din `ui.tsx`: `levelFromPoints` / niveluri / XP / streak
- [x] **21.3** `GET /api/sites/:id/home` — adăugat `aiVisibility { score, delta, history }` (categoria
  `geo` promovată) + `signals[]` (rank_up/down, refresh_needed, competitor_move, answer_gap,
  content_ready); nou `GET /api/sites/:id/signals`
- [x] **21.4** Reguli GEO noi — `geo.answer-ready` (întrebări-heading fără schema FAQ),
  `geo.tldr` (rezumat „Pe scurt" pe pagini lungi), `onpage.localbusiness-schema` (schema
  LocalBusiness/Organization pe home/contact) + intrări în `catalog.ts` + 6 teste noi
- [x] **21.5** Conținut asistat — `routes/content.ts`: `GET /content` (idei din playbooks + drafturi),
  `POST /content/:kwId/start` (asamblează prompt din brief + profil + H2 competitori; interzice
  statistici inventate + promisiuni de poziție), `PUT /content/:id` (lipești articolul),
  `POST /content/:id/publish` (draft WP prin `wordpress.createDraftPost`, **niciodată** `publish`),
  `POST /content/:id/discard`; `shared/markdown.ts` (`mdToHtml`, testat); tab `content/page.tsx`
- [x] **21.6** GA4 — `connectors/ga4.ts` (OAuth reuse, scope `analytics.readonly`, `runReport`,
  `accountSummaries`); `routes/analytics.ts` (`POST /ga/connect`, `GET /sites/ga/callback`,
  `GET /ga/traffic` cu cache 6h); card în Setări
- [x] **21.7** GBP — `connectors/gbp.ts` schelet complet în spatele `FEATURE_GBP=off` (API-ul cere
  aprobare Google); notă + link în Setări; SEO local acoperit acum prin regula `onpage.localbusiness-schema`
- **Gata când:** type-check 12/12, lint curat, `web build` OK (17 rute), 114 teste; `/home` cu
  `aiVisibility`+`signals` și fluxul de conținut (start→save→discard) verificate pe salesup.ro.

## Epic 22 — Blueprint de pagină + proiecție 30/60/90 (config per-site, reutilizabil)

Spune exact ce cuvânt țintește fiecare pagină și cum s-o refaci; proiecție de trafic pe faze.
Totul config-driven din `business_profiles` (piață/geo/oraș) — nimic hardcodat pe nișă.

- [x] **22.1** Config de piață per-site — `business_profiles` +`geo_country`/`geo_language`/`primary_city`/
  `local_emphasis` (migrație `0005`). `strategy-shared.ts` `glFor(profile)`/`hlFor(profile)`, env doar fallback.
  UI în `ProfileCard` (Setări): țară / limbă / oraș principal / comutator „accent local".
- [x] **22.2** `packages/strategy/src/page-target.ts` — `assignPageTargets(pages, keywords, {primaryCity,
  localEmphasis, homepageUrl})` pur: fiecare pagină primește cel mai bun cuvânt (fit × oportunitate ×
  relevanță), homepage-ul primește head term-ul (varianta locală dacă e cazul), diagnostic
  `ok|cannibalization|orphan_page|no_target`. 4 teste noi.
- [x] **22.3** Tabel `page_blueprints` (migrație `0005`) + job `page-plan` (`apps/worker/src/jobs/page-plan.ts`,
  în `JOB_TYPES`): sinteză deterministă — `current` vs `recommended` (title/H1/meta din șabloane
  parametrizate de profil, `h2Outline` din `pageContentGap` + brief, `schemaType` LocalBusiness/
  Organization/Article, linkuri interne din cluster), `potential` (CTR interval din `shared/ctr.ts`;
  `qualitative` fără volum). Rulează după `strategy-build`; re-enqueue `estimate`.
- [x] **22.4** `packages/estimator` — `EstimateInput.pageUpliftClicks` (bottom-up, doar restrânge estimarea,
  nu o umflă) + `phases[]` 30/60/90/180 (`phasesFromSeries`), `traffic_estimates.phases jsonb`.
  Jobul `estimate` însumează `page_blueprints.potential` și trece `pageUpliftClicks`; email „crawl done"
  doar la prima estimare per crawl. 4 teste noi (toate garanțiile ≤2× MoM rămân).
- [x] **22.5** API `apps/api/src/routes/plan.ts` — `GET /plan` (blueprints + market + projection),
  `POST /plan/rebuild`, `GET /blueprints/:id`, `POST /blueprints/:id/apply` (title+meta pe WP prin
  `wordpress.applyFix`, cu `previous` pentru rollback), `POST /blueprints/:id/prompt` (prompt de
  rescriere), `POST /blueprints/:id/dismiss`, `POST /blueprints/:id/rollback`. Profil PUT devine
  merge parțial (nu mai șterge câmpuri netrimise).
- [x] **22.6** UI — sub-secțiune „Pagini" în tab-ul Analiză (`pages-plan/page.tsx`): listă de
  blueprint-uri (homepage primul, badge de diagnostic), detaliu Acum vs. Recomandat + Potențial +
  butoane „Aprobă title+meta" / „Copiază prompt" / „Renunță". Card „Proiecție 30/60/90" pe Autopilot
  (benzi low–high + ipoteze, guard pentru date insuficiente).
- **Gata când:** type-check 12/12, lint curat, `web build` OK (18 rute), 121 teste; `page-plan` rulat
  pe salesup.ro → 14 blueprint-uri (homepage țintă „agentie google ads bucuresti" + schema LocalBusiness,
  5 canibalizări detectate), `/plan` întoarce `phases` + `market`. Test de reutilizare: profil nou pe
  alt domeniu/altă piață → zero referințe hardcodate la nișă în cod (doar din profil).
