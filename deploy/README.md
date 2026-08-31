# Deploy

Toate serviciile pe free tier. Vezi [../ARCHITECTURE.md](../ARCHITECTURE.md) pentru limite și calea de migrare.

## Web — Vercel

1. Import repo în Vercel, Root Directory = `apps/web`.
2. Framework preset: Next.js. Build command implicit.
3. Env: `API_BASE_URL` = URL-ul public al API-ului Fly, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy automat la push pe `main`.

> Vercel Hobby este **non-comercial**. La primul client: Vercel Pro sau self-host Next.js pe VPS.

## API + Worker — Fly.io

```bash
fly launch --no-deploy -c deploy/fly.api.toml
fly secrets set -c deploy/fly.api.toml \
  DATABASE_URL=... ENCRYPTION_KEY=... \
  SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  PAGESPEED_API_KEY=... LLM_PROVIDER=none
fly deploy -c deploy/fly.api.toml

fly launch --no-deploy -c deploy/fly.worker.toml
fly secrets set -c deploy/fly.worker.toml DATABASE_URL=... ENCRYPTION_KEY=... LLM_PROVIDER=none
fly deploy -c deploy/fly.worker.toml
```

## Postgres — Supabase

- Creează proiect, ia connection string-ul (pooler `...6543` pentru apps, direct `...5432` pentru migrații).
- `DATABASE_URL` = pooler, `DATABASE_URL_DIRECT` = direct.
- Rulează migrațiile local o dată: `pnpm db:migrate`.
- Un cron GitHub Actions cu ping zilnic ține proiectul free din pauză (Epic 11).

## Redis — Upstash

- Creează o bază Redis, pune URL-ul în `REDIS_URL`. **Doar cache** (PSI/CrUX). Coada NU folosește Redis.
