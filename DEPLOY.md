# Deploy — 0 € / month, always-on

```
apps/web            →  Vercel (Hobby, free)              https://<project>.vercel.app
apps/api + worker   →  1 Oracle Cloud Always Free VM     https://<vm-ip>.sslip.io   (Caddy = auto HTTPS)
Postgres + Auth     →  Supabase free (already in use)    + a daily GitHub Action so it never pauses
Redis               →  not deployed (cache falls back to in-memory; optional)
```

Files in this repo that do the work: `Dockerfile`, `docker-compose.yml`, `Caddyfile`,
`.github/workflows/keepalive.yml`.

---

## Part A — the VM (api + worker)

### A1. Create the VM (Oracle Cloud, "Always Free")

1. Oracle Cloud console → **Compute → Instances → Create instance**.
2. **Image & shape**: Canonical **Ubuntu 22.04**; shape **`VM.Standard.A1.Flex`** (ARM Ampere).
   Set **1 OCPU / 6 GB RAM** — well inside the Always Free allowance (up to 4 OCPU / 24 GB of A1).
   *(The AMD `E2.1.Micro` is also free but only 1 GB — too tight for the Docker build. Use A1.)*
3. **SSH keys**: upload your public key (or let Oracle generate one and download it).
4. Create. Note the **public IP** (e.g. `140.238.1.2`).

### A2. Open ports 80 + 443

Oracle blocks everything except SSH by default, in **two** places — do both:

**a) VCN security list** (console): Networking → Virtual Cloud Networks → your VCN → the public
subnet's **Security List** → **Add Ingress Rules**:
- Source `0.0.0.0/0`, IP Protocol TCP, Destination port **80**
- Source `0.0.0.0/0`, IP Protocol TCP, Destination port **443**

**b) On the VM** (Ubuntu images ship host firewall rules):
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### A3. Install Docker

```bash
ssh ubuntu@<vm-ip>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit && ssh ubuntu@<vm-ip>          # re-login so the group applies
docker compose version              # should print v2.x
```

### A4. Get the code + secrets onto the VM

```bash
git clone <your repo url> seo-tool && cd seo-tool
cp .env.example .env
nano .env
```

Fill `.env` with the **server-side** values (leave the `NEXT_PUBLIC_*` ones out — those live on
Vercel). Minimum:

| var | value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL`, `DATABASE_URL_DIRECT` | your Supabase pooler / direct URIs |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | from Supabase → Project Settings → API |
| `ENCRYPTION_KEY` | the 32-byte base64 key (same one you use locally — must not change or stored secrets can't be decrypted) |
| `WEB_BASE_URL` | `https://<project>.vercel.app`  *(CORS origin — set after Part B, then `docker compose restart api`)* |
| `PAGESPEED_API_KEY` | your PSI key |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | from Google Cloud |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://<vm-ip>.sslip.io/api/sites/gsc/callback` |
| `GOOGLE_OAUTH_GA_REDIRECT_URI` | `https://<vm-ip>.sslip.io/api/sites/ga/callback` |
| `LLM_PROVIDER` | `none` |
| `RENDER_ENABLED` | `0` |
| `SERP_PROVIDER` | `none` |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | optional (once Google approves Basic access) |
| `RANK_REFRESH_CRON` | `0 6 * * 1` |

### A5. Run it

```bash
export API_HOST=<vm-ip>.sslip.io          # e.g. 140.238.1.2.sslip.io  (dots in the IP are fine)
echo "API_HOST=$API_HOST" >> .env         # so it survives new shells / reboots
docker compose up -d --build              # first build ~3–6 min
docker compose logs -f caddy              # watch it get the TLS cert
```

Check: `curl https://<vm-ip>.sslip.io/healthz` → `{"ok":true,...}`.

The **worker** starts automatically and registers the weekly `strategy-weekly` cron itself
(no extra scheduler needed). `restart: unless-stopped` brings everything back after a reboot.

---

## Part B — the web app (Vercel)

1. vercel.com → **Add New → Project** → import this Git repo.
2. **Root Directory**: `apps/web`. Framework preset: **Next.js** (auto). Vercel runs `pnpm install`
   at the workspace root automatically.
3. **Environment Variables** (Production):

| var | value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` *and* `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` *and* `SUPABASE_ANON_KEY` | the anon key |
| `NEXT_PUBLIC_API_BASE_URL` *and* `API_BASE_URL` | `https://<vm-ip>.sslip.io` |

*(`next.config.mjs` maps the non-prefixed ones to `NEXT_PUBLIC_*`; setting both is belt-and-braces.)*
The web app needs **no** database URL and **no** service-role key.

4. Deploy → note the URL `https://<project>.vercel.app`.
5. Back on the VM: set `WEB_BASE_URL=https://<project>.vercel.app` in `.env`, then
   `docker compose restart api` (CORS).

---

## Part C — Supabase Auth + Google OAuth

**Supabase** → Authentication → **URL Configuration**:
- **Site URL**: `https://<project>.vercel.app`
- **Redirect URLs**: add `https://<project>.vercel.app/**`

**Google Cloud Console** → APIs & Services → **Credentials** → your OAuth client → **Authorized
redirect URIs**, add:
- `https://<vm-ip>.sslip.io/api/sites/gsc/callback`
- `https://<vm-ip>.sslip.io/api/sites/ga/callback`

(Keep the `localhost:3001` ones for local dev.)

---

## Part D — keepalive (stop Supabase from pausing)

GitHub repo → Settings → **Secrets and variables → Actions** → add:
- `SUPABASE_URL` = `https://<ref>.supabase.co`
- `SUPABASE_ANON_KEY` = the anon key

`.github/workflows/keepalive.yml` then pings it daily. Run it once manually
(Actions tab → keepalive → *Run workflow*) to confirm.

---

## Security — do before it's public

- **Rotate the Supabase DB password** (it appeared in a chat). Supabase → Project Settings →
  Database → Reset database password, then update `DATABASE_URL(_DIRECT)` on the VM +
  `docker compose restart`.
- Consider rotating `SUPABASE_SERVICE_ROLE_KEY` too (Project Settings → API → *Reset*).
- Secrets live **only** in the VM's `.env` (chmod 600) and Vercel's env store — never in git.
  `.env` is already git-ignored; `.dockerignore` keeps it out of the image.
- RLS is already enabled on every table; the API/worker connect as owner and do ownership checks
  in code. No change needed.

---

## Updating later

```bash
# VM (api + worker)
cd seo-tool && git pull && docker compose up -d --build

# DB migrations (run from your laptop against the prod DB, or on the VM):
pnpm --filter db migrate && pnpm --filter db policies

# Web: Vercel redeploys automatically on git push.
```

---

## Troubleshooting

| symptom | fix |
|---|---|
| `curl https://<host>/healthz` hangs | ports 80/443 not open — recheck **both** A2 steps |
| Caddy log: cert error | `<vm-ip>.sslip.io` must resolve to the VM (`dig <vm-ip>.sslip.io`); port 80 must be reachable for the ACME challenge |
| web loads but every call fails CORS | `WEB_BASE_URL` on the VM ≠ the exact Vercel origin; fix + `docker compose restart api` |
| login redirect loops | Supabase Site URL / Redirect URLs not set (Part C) |
| GSC "Conectează" → redirect_uri_mismatch | add the `sslip.io` callback URLs in Google Cloud (Part C) |
| `docker compose up` OOM during build | you're on the 1 GB AMD micro — recreate as A1 Flex with ≥ 4 GB |
| worker not processing jobs | `docker compose logs worker`; check `DATABASE_URL` reachable from the VM |
