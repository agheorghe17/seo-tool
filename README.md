# SEO Audit Platform

Aplicație web care scanează site-uri pagină-cu-pagină, calculează un scor SEO 0-100, generează recomandări
prioritizate cu explicații LLM și estimează creșterea de trafic organic ca interval. Aplică automat fix-uri sigure
pe site-uri WordPress conectate. Fără link building.

- Arhitectură: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Plan de lucru (12 epics): [EPICS.md](./EPICS.md)
- Ghid pentru dezvoltare: [CLAUDE.md](./CLAUDE.md)

## Quick start

```bash
# 1. instalează dependențele
pnpm install

# 2. configurează mediul
cp .env.example .env
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
# lipește valoarea în .env, plus DATABASE_URL / REDIS_URL / SUPABASE_*

# 3. aplică schema pe bază
pnpm db:migrate

# 4. pornește totul
pnpm dev
```

- Web:    http://localhost:3000
- API:    http://localhost:3001/healthz
- Worker: rulează în același terminal (turbo)

## Stack

Next.js 15 · Fastify 5 · Drizzle ORM · PostgreSQL (Supabase) · pg-boss · Redis (cache) · Playwright ·
Turborepo + pnpm · TypeScript.
