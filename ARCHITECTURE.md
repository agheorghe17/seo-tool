# Arhitectură — SEO Audit Platform

## Ce construim

O aplicație **web** (nu mobilă) care:

1. scanează un site pagină-cu-pagină (WordPress conectat sau universal prin verificare de proprietate),
2. calculează un scor SEO 0-100 per pagină și per site pe reguli tehnice / on-page / conținut / Core Web Vitals / GEO (AI Overviews readiness),
3. generează recomandări prioritizate impact×efort, cu explicații în limbaj natural produse de un LLM **strict din date structurate** (fără text brut → fără halucinații),
4. estimează creșterea de trafic organic **ca interval** cu asumpții explicite, niciodată o cifră fixă „garantată”,
5. aplică automat fix-uri sigure pe site-urile WordPress conectate (meta, alt text, schema).

**Explicit în afara scopului:** aplicație mobilă, link building / outreach de backlink-uri, index propriu de backlink-uri.

**Obiectiv de fază:** MVP pentru uz personal acum, dar arhitectat de la început pentru trecere ulterioară în comercial (multi-tenant, cote per plan, izolare de date).

---

## Decizii de stack

| Decizie | Alegere |
|---|---|
| Backend | **Node / TypeScript** — Fastify 5 (API) + worker Node + Playwright + Cheerio/undici |
| Hosting | Free tiers managed — Vercel (web), Supabase (Postgres + Auth), Upstash Redis (cache), worker pe Fly.io |
| API-uri plătite | Doar surse gratuite în v1 (PageSpeed Insights + CrUX + Google Search Console). Strat LLM pluggable. DataForSEO în spatele unui feature flag, oprit implicit |
| Coadă de joburi | `pg-boss` (pe Postgres) — nu BullMQ, ca să nu consumăm bugetul de comenzi Upstash. Redis rămâne **doar cache** |

### Componente

| Componentă | Alegere | Note |
|---|---|---|
| Frontend | Next.js 15 App Router + React 19 + Tailwind + shadcn/ui + TanStack Query | server components; Zustand doar pentru UI efemer |
| API | Fastify 5 + `@fastify/jwt` (JWT Supabase) + Zod | fără logică lungă în request; totul async |
| Coadă | `pg-boss` pe Postgres | retry cu backoff, concurență limitată per tip de job |
| DB | PostgreSQL (Supabase) + Drizzle ORM | RLS activat, `service_role` doar pe server |
| Cache | Redis (Upstash) | TTL 24-72h pe răspunsuri PSI/CrUX; rate-limit tokens |
| Realtime progres | Supabase Realtime (subscribe pe rândul `crawls`) | SSE din Fastify ca fallback |
| Fetch static | `undici` + `cheerio` | zeci de pagini în paralel |
| Render JS | Playwright (Chromium) în worker separat | doar pentru pagini unde fetch static întoarce conținut gol/incomplet |
| Viteză / CWV | PageSpeed Insights API + CrUX API | gratuite; nu calculăm noi |
| Trafic real | Google Search Console API (OAuth) | opțional, per site; ridică nivelul de încredere al estimării |
| LLM | `packages/llm` — `LLM_PROVIDER=anthropic\|ollama\|none` | implicit `anthropic` (cenți/audit); `ollama` = 0 lei; `none` = doar template din catalog |
| Keywords / SERP | GSC (gratuit) în v1; DataForSEO în spatele `FEATURE_DATAFORSEO` | |
| Secrete site | AES-256-GCM cu `ENCRYPTION_KEY` din env (`node:crypto`) | alternativă: Supabase Vault |
| Observabilitate | Sentry (free tier) + logging structurat (pino) | |

---

## Flux de date

```
[Conectare site]
  ├─ WordPress: REST API + Application Passwords (citire + scriere fix-uri)
  └─ Universal: verificare proprietate (meta tag / fișier HTML / DNS TXT) → doar citire
        │
        ▼  (API pune un job în coadă, NU blochează request-ul HTTP)
[worker: crawl] ── sitemap discovery + robots.txt + rate limit + fetch static paralel
        │           └─ pagini JS-heavy → sub-job [worker: render] (Playwright, scale-to-zero)
        ▼
[worker: enrich] ── PageSpeed Insights API + CrUX API (rezultate cache-uite în Redis)
        ▼
[worker: score] ── catalog de reguli ponderate (cod, pur, unit-tested) → scor 0-100 pagină + site
        ▼
[worker: recommend] ── issue → fix din catalog + prioritizare impact×efort + explicație LLM
        ├───────────────┬────────────────────┐
        ▼               ▼                    ▼
[worker: estimate]  [worker: wp-apply]   progres live (crawls.* → Supabase Realtime)
  GSC baseline sau    doar site-uri WP,       │
  keyword fallback,   fix-uri auto_fixable,   ▼
  interval + asumpții  cu confirmare      [web: dashboard Next.js]
```

---

## Layout monorepo

```
apps/
  web/         Next.js 15 (App Router, React 19) — dashboard + pagini marketing
  api/         Fastify 5 — REST + SSE fallback, validează input (Zod), pune joburi în pg-boss
  worker/      proces Node — consumeri pg-boss: crawl | render | enrich | score | recommend | estimate | wp-apply
packages/
  db/          Drizzle ORM schema + migrații + client Postgres (export `db` + toate tabelele)
  shared/      tipuri + utilitare pure: curbe CTR-pe-poziție, matematica scorului, matematica priorității, cripto
  scoring/     catalog de reguli + motor de scoring (100% pur, acoperire mare de teste)
  crawler/     fetch static, parsare sitemap, robots.txt, extractor HTML, render Playwright
  llm/         interfață `explain(issue): Explanation` + adaptoare: anthropic | ollama | none
  connectors/  wordpress (App Passwords + REST) | gsc (OAuth) | psi | crux | dataforseo (flagged)
  config/      preset-uri partajate: eslint, tsconfig, tailwind
```

Consum: orice app importă `import { db, sites } from 'db'`, `import { Site } from 'shared'` — rezolvat prin pnpm workspace links.

---

## Repartiție pe hosting (toate free tier)

| Serviciu | Rol | Limită relevantă free | Prima mutare la comercial |
|---|---|---|---|
| **Vercel** Hobby | `apps/web` | uz **non-comercial** | Vercel Pro $20/lună sau self-host Next.js pe VPS |
| **Supabase** Free | Postgres + Auth + Realtime | 500 MB DB, pauză după 7 zile inactiv, 2 proiecte | Supabase Pro $25/lună |
| **Upstash Redis** Free | cache PSI/CrUX + rate-limit tokens | 256 MB, 500K comenzi/lună | Upstash pay-as-you-go |
| **Fly.io** | `apps/api` + `apps/worker` + mașină de render scale-to-zero | alocație mică gratuită, necesită card | mașini dedicate ~$2-5/lună sau VPS Hetzner ~€4/lună |
| **GitHub Actions** | CI + deploy | 2000 min/lună repo privat | — |

---

## Model de date (Drizzle, `packages/db/src/schema/`)

```
users              id, email, plan (free|pro), quota_pages_month, quota_used, created_at
sites              id, user_id, domain, connection_type (wordpress|universal),
                   wp_site_url, verification_method, verification_token, verified_at,
                   gsc_connected (bool), gsc_property, plan_override, created_at
site_secrets       site_id, kind (wp_app_password|gsc_refresh_token), ciphertext, iv, tag, updated_at
crawls             id, site_id, status (queued|running|completed|failed|partial),
                   pages_total, pages_scanned, pages_rendered, error, started_at, completed_at
pages              id, crawl_id, url, status_code, redirect_chain_json, indexability (indexable|noindex|blocked),
                   rendered_with (static|playwright), content_hash,
                   title, meta_description, h1, headings_json, word_count, canonical_url,
                   schema_json, images_json (src+alt), internal_links_count, external_links_count,
                   lcp_ms, inp_ms, cls_score, mobile_friendly (bool),
                   score_technical, score_cwv, score_onpage, score_content, score_geo, score_total
issues             id, page_id, rule_id, rule_version, category, severity (critical|warning|info),
                   description, detected_value, site_level (bool)
recommendations    id, issue_id, fix_title, fix_description_ai_generated, llm_provider,
                   impact_score, effort_score, priority_rank, auto_fixable (bool),
                   applied (bool), applied_at, applied_result_json
keyword_data       id, site_id, keyword, search_volume, current_position, target_page_id,
                   difficulty_score, source (gsc|dataforseo), fetched_at
traffic_estimates  id, site_id, generated_at, baseline_monthly_visits, baseline_source (gsc|keyword_model),
                   estimate_low, estimate_mid, estimate_high, horizon_months,
                   assumptions_json, confidence_level (low|medium|high)
audit_reports      id, site_id, crawl_id, format (pdf|csv), storage_path, generated_at
job_runs           id, crawl_id, type, status, attempts, error, duration_ms
```

Catalogul de reguli **nu** stă în DB: trăiește în cod la `packages/scoring/src/rules/*.ts`, fiecare regulă =
`{ id, category, weight, severity, check(pageData) => Issue | null, fixTitle, impactHint, effortHint }`, versionat prin `rule_version`.

---

## Constrângeri non-negociabile

1. **Estimarea de trafic este întotdeauna un interval** (`low`-`high`) cu `confidence_level` și listă de `assumptions` vizibilă. Niciodată „luna 1: X, luna 2: 10X”. Interzisă proiecția >2× lună-la-lună pentru site fără istoric/autoritate. Motiv: doar ~1,74% din paginile noi ajung în top 10 în primul an; Google însuși indică 4-12 luni până la rezultate.
2. **Zero link building** — niciun modul de outreach, achiziție sau sugestie de backlink-uri plătite.
3. **Cost 0 pe infrastructură** în v1 (excepție acceptată: cenți/audit pe LLM dacă `LLM_PROVIDER=anthropic`; `ollama`/`none` păstrează 0 lei).
4. **LLM primește doar date structurate** despre issue, niciodată textul brut al paginii.
5. **Scriere pe site doar cu confirmare** — per-fix sau bulk explicit, doar `auto_fixable`, doar WordPress conectat.
6. **Izolare de date** — RLS pe toate tabelele cu `user_id`; secretele site-urilor criptate at rest; `service_role` niciodată în client.
7. **Respectă `robots.txt`** (disallow + crawl-delay) și rate-limit implicit 1-2 req/s per domeniu.

---

## Riscuri & mitigări

| Risc | Impact | Mitigare |
|---|---|---|
| Playwright/Chromium nu încape pe alocația Fly free (256-512 MB) | Render JS pică (OOM) | Worker de render separat, scale-to-zero, blocare resurse grele; cale $0: pagini JS-heavy semnalate, nu randate, până există buget de infra |
| Vercel Hobby e non-comercial | Nu poți factura pe infra actuală | La primul client: Vercel Pro ($20) sau self-host Next.js pe VPS (deja containerizat) |
| Supabase free pune proiectul în pauză după 7 zile | Downtime pentru uz personal intermitent | Cron GitHub Actions cu ping zilnic; upgrade la Pro la comercial |
| Upstash 500K comenzi/lună | Coada ar consuma bugetul | Coada e pe `pg-boss` (Postgres), Redis rămâne doar cache cu TTL |
| LLM cu `anthropic` nu e strict 0 lei | Cost mic per audit | Se poate rula `ollama` (local) sau `none`; cache pe explicații identice |
| Estimarea de trafic percepută ca promisiune | Pierdere de încredere / risc legal la comercial | Interval obligatoriu + asumpții + disclaimer în UI + teste care blochează cifra fixă |
| Crawler folosit ca SSRF / abuzat | Securitate | Allowlist scheme, blocare IP-uri private, doar domenii verificate, rate limit, timeout |
| Site-uri mari > 2000 pagini | Cost & timp | Limită dură v1 + restrângere pe secțiune de sitemap; cotă per plan (Epic 10) |
| DataForSEO ar fi tentant devreme | Sparge „cost 0” | Rămâne în spatele `FEATURE_DATAFORSEO`, oprit; GSC acoperă keywords în v1 |

---

## Decizii rămase deschise (minore)

1. **Distribuție conector WordPress** — plugin pe WordPress.org vs. instrucțiuni + snippet documentat la început. *Recomandare: instrucțiuni + snippet în v1.*
2. **Format export raport** — PDF server-side (Playwright print) vs. HTML + „print to PDF” client. *Recomandare: HTML → Playwright print, refolosește worker-ul de render.*
3. **Model local pentru `ollama`** — care model și unde rulează. *De confirmat la Epic 5.*
4. **Curbele CTR-pe-poziție** — ce sursă publică se citează exact. *De fixat la Epic 7.3.*
