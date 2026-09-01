# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

**SEO Audit Platform** — o aplicație web care scanează site-uri pagină-cu-pagină, calculează un scor SEO 0-100
(tehnic / on-page / conținut / Core Web Vitals / GEO), generează recomandări prioritizate cu explicații LLM din date
structurate, estimează creșterea de trafic organic **ca interval** și aplică automat fix-uri sigure pe site-uri
WordPress conectate.

MVP pentru uz personal, arhitectat pentru trecere ulterioară în comercial. Fără link building. Costuri de infra 0 în v1.

Monorepo **Turborepo + pnpm workspaces**. Node >= 22, pnpm 11.5.1.

Vezi [ARCHITECTURE.md](./ARCHITECTURE.md) pentru arhitectură completă și [EPICS.md](./EPICS.md) pentru planul de lucru
(12 epics cu checkboxes) — verifică EPICS.md înainte de a începe orice feature.

---

## Commands

### From repo root

```bash
pnpm dev            # web + api + worker în paralel (turbo)
pnpm dev:web        # Next.js  → http://localhost:3000
pnpm dev:api        # Fastify  → http://localhost:3001
pnpm dev:worker     # worker pg-boss (necesită DATABASE_URL)
pnpm build          # build toate pachetele
pnpm lint           # ESLint peste tot
pnpm type-check     # tsc --noEmit peste tot
pnpm test           # Vitest peste tot
```

### Database (din `packages/db/`)

```bash
pnpm db:generate    # generează migrații Drizzle din schimbări de schemă
pnpm db:migrate     # aplică migrațiile pe DB (folosește DATABASE_URL_DIRECT)
pnpm db:studio      # Drizzle Studio → https://local.drizzle.studio
```

---

## Architecture

### Monorepo layout

```
apps/
  web/     Next.js 15 (App Router, React 19) — dashboard + marketing
  api/     Fastify 5 — REST + SSE, port 3001, pune joburi în pg-boss
  worker/  proces Node — consumeri pg-boss: crawl | render | enrich | score | recommend | estimate | wp-apply
packages/
  db/          Drizzle schema + migrații + client Postgres (exportă `db` + toate tabelele)
  shared/      tipuri + utilitare pure (crypto AES-256-GCM, curbe CTR, matematica scorului/priorității)
  scoring/     catalog de reguli + motor de scoring + fix catalog (PUR, fără I/O, unit-tested)
  crawler/     fetch static (undici), sitemap, robots.txt, extractor (cheerio), render (playwright-core)
  llm/         `explainIssue()` + `completeJson()` provider-agnostic + adaptoare anthropic | ollama | none + guardrail + cache
  estimator/   estimare de trafic ca INTERVAL (impact × ramp-up), pur, testat
  strategy/    PUR — intent, clustering, relevanță, striking distance, target-keyword, content-gap, opportunity score
  connectors/  wordpress | gsc | psi | crux | autocomplete | keywordplanner | serp/ (pluggable) | dataforseo | cache
  config/      preset-uri eslint / tsconfig / tailwind
```

### Cum se consumă pachetele

Orice app importă `import { db, sites } from 'db'`, `import { Site, encryptSecret } from 'shared'` — rezolvat prin
pnpm workspace links. `packages/shared` este sursa de adevăr pentru tipuri.

### Reguli de aur

- **Coada de joburi este `pg-boss` pe Postgres.** Redis (`REDIS_URL`) este **doar cache** (PSI/CrUX) + rate-limit
  tokens. Nu adăuga BullMQ / joburi pe Redis fără decizie explicită.
- **`packages/scoring` este pur** — fără fetch, fără DB, fără `process.env`. Primește `PageData`, întoarce
  `{ scores, issues }`. Toate regulile au teste pe fixture-uri HTML.
- **LLM primește doar date structurate despre issue**, niciodată textul brut al paginii. Vezi guardrail-ul
  anti-halucinație în `packages/llm`.
- **Estimarea de trafic este ÎNTOTDEAUNA un interval** (`low`/`mid`/`high`) cu `assumptions` și `confidence_level`.
  Nu există cale de cod care emite o cifră fixă „garantată” sau o creștere > 2× lună-la-lună. Există teste care
  blochează asta.
- **Scrierea pe site-uri** (WordPress) se face doar pentru fix-uri `auto_fixable` și doar cu confirmare explicită
  (per-fix sau bulk). Valoarea veche se salvează în `recommendations.applied_result_json` pentru rollback.
- **Secretele site-urilor** (WP Application Password, GSC refresh token) se stochează criptate în `site_secrets`
  prin `encryptSecret` / `decryptSecret` din `packages/shared`. Nu loga niciodată valorile decriptate.
- **RLS** este activat pe toate tabelele cu `user_id`. `SUPABASE_SERVICE_ROLE_KEY` doar pe server (api / worker).
- **Crawler-ul** respectă `robots.txt` (disallow + crawl-delay), rate-limit implicit 2 req/s per domeniu, blochează
  IP-uri private / non-http(s) (anti-SSRF), și rulează doar pe domenii verificate.

### Pipeline de joburi

`crawl` → `enrich` → `score` → `recommend` → `estimate`. Fiecare job îl pune pe următorul la succes. Sub-jobul
`render` (Playwright) e declanșat din `crawl` doar pentru pagini JS-heavy. `wp-apply` e declanșat manual din API.
Progresul se scrie pe rândul `crawls` și e citit live în web prin Supabase Realtime (SSE fallback din api).

---

## Environment variables

Copiază `.env.example` → `.env` la rădăcină. Câmpuri esențiale pentru dev local:

- `DATABASE_URL` / `DATABASE_URL_DIRECT` — Postgres (Supabase sau local)
- `REDIS_URL` — Redis local sau Upstash (doar cache)
- `ENCRYPTION_KEY` — 32 bytes: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — auth
- `LLM_PROVIDER=none` pentru dev fără cost (sau `ollama` cu Ollama local, sau `anthropic` + `ANTHROPIC_API_KEY`)
- `PAGESPEED_API_KEY` — gratuit din Google Cloud Console
- `FEATURE_DATAFORSEO=off` — implicit oprit

---

## Status

Epics 0-22 implementate — audit (0-12) + Strategie (13-19) + UX (20) + „Autopilot" (21) + „Blueprint de pagină" (22).

**Blueprint de pagină (Epic 22):** `page-plan` job (`apps/worker/src/jobs/page-plan.ts`) → tabel
`page_blueprints`: pentru fiecare pagină, cuvântul țintă (`strategy/page-target.ts` `assignPageTargets`,
pur, niche-agnostic) + `current` vs `recommended` (title/H1/meta/H2/schema/linkuri) + `potential`
(interval CTR). Config de piață per-site pe `business_profiles` (`geo_country`/`geo_language`/
`primary_city`/`local_emphasis`) — env `STRATEGY_GEO`/`STRATEGY_LANG` = doar fallback (`glFor`/`hlFor`
în `strategy-shared.ts`). Proiecție 30/60/90/180 în `estimator` (`estimatePhased` via `phases[]` +
`pageUpliftClicks` bottom-up, care doar restrânge; `traffic_estimates.phases`). API
`apps/api/src/routes/plan.ts` (`GET /plan`, `apply` title+meta pe WP cu rollback, `prompt` de
rescriere). UI: sub-secțiune „Pagini" în tab-ul Analiză (`pages-plan/`) + card „Proiecție 30/60/90"
pe Autopilot.

**UI (Epic 21):** model de agent, tab-uri per site sub `apps/web/app/(app)/sites/[siteId]/`
(`layout.tsx`): **Autopilot** (`page.tsx` — casetă de comandă, 2 gauge Sănătate + Vizibilitate AI,
„ce se întâmplă acum", coadă de aprobare, semnale) · **Aprobări** (`tasks/`) · **Conținut**
(`content/`) · **Analiză** (`keywords/` + `competitors/`) · **Setări** (`settings/`).
`GET /api/sites/:id/home` întoarce `score` + `aiVisibility` (categoria `geo` promovată) + `signals[]`;
`GET /api/sites/:id/signals`, `GET /api/sites/:id/tasks` (`apps/api/src/routes/home.ts`).

**Conținut fără API plătit** (`apps/api/src/routes/content.ts`): aplicația asamblează un *prompt* din
brief + profil + H2 competitori (`content_drafts.prompt_text`), utilizatorul îl rulează în Claude-ul
lui, lipește articolul (`article_md`), iar `POST /content/:id/publish` îl pune pe WordPress **ca draft**
(`wordpress.createDraftPost`, niciodată `status:'publish'`). `shared/mdToHtml` face conversia.

**GA4** (`connectors/ga4.ts` + `routes/analytics.ts`): OAuth reuse (scope `analytics.readonly`),
`/api/sites/:id/ga/connect` + `/api/sites/ga/callback`. **GBP** (`connectors/gbp.ts`): schelet în
spatele `FEATURE_GBP=off` (API-ul cere aprobare Google).

Reguli GEO noi: `geo.answer-ready`, `geo.tldr`, `onpage.localbusiness-schema`.

**UI (Epic 20, înlocuit parțial de 21):** flux unificat per site; `GET /api/sites/:id/tasks` (listă
unificată: fix-uri audit grupate pe `rule_id` + oportunități keyword + `roadmap_items`).
Design system: token-uri CSS în `apps/web/app/globals.css`, componente în `components/ui.tsx`
(`Gauge`, `ProgressBar`, `Stat`, `Chip`, `Sheet`…) + `components/TaskCard.tsx`.

Epics 0-19 implementate — audit complet (0-12) + modul Strategie de keywords & competitori (13-19).
Verificat end-to-end pe Supabase real: pipeline audit `crawl→enrich→score→recommend→estimate` și
pipeline strategie `profile-extract→keyword-research→rank-import→competitor-crawl→strategy-build`.
98 teste; type-check + lint + `web build` verzi.

Modulul Strategie funcționează fără niciun API plătit (autocomplete + crawl competitori + matching pe
paginile proprii). Se îmbogățește progresiv: GSC → poziții reale + striking distance; `GOOGLE_ADS_DEVELOPER_TOKEN`
→ volum; `SERP_PROVIDER` + cheie → poziții live vs competitori; `LLM_PROVIDER` → profil/briefuri/narativ mai bune.

Migrații: `packages/db/migrations/` (`0000_init` … `0003_strategy_uq` — 19 tabele). RLS: `packages/db/sql/policies.sql`.
`pnpm --filter db build` rulează automat înainte de `db:generate` / `db:push` / `db:studio`.
Job programat săptămânal: `strategy-weekly` (pg-boss, `RANK_REFRESH_CRON`).
