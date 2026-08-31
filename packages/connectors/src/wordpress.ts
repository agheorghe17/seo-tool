/**
 * Epic 1.4 + Epic 6 — WordPress REST client authenticated with an Application Password.
 * Credentials come decrypted from `site_secrets` (never stored in plaintext).
 *
 * `fetchImpl` is injectable so connection logic is unit-testable against a fixture server.
 */

export interface WpCredentials {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

export type SeoPlugin = 'yoast' | 'rankmath' | null;

export interface WpConnectionInfo {
  ok: boolean;
  restBase: string;
  types: string[];
  seoPlugin: SeoPlugin;
  /** Present when `ok` is false. */
  reason?: string;
}

export interface WpClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function normaliseSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

export function restBaseFor(siteUrl: string): string {
  return `${normaliseSiteUrl(siteUrl)}/wp-json`;
}

function authHeader(creds: WpCredentials): string {
  // Application Passwords are used with HTTP Basic auth. Spaces in the password are allowed.
  const raw = `${creds.username}:${creds.applicationPassword}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

async function wpGet<T>(
  creds: WpCredentials,
  path: string,
  opts: WpClientOptions,
): Promise<{ status: number; body: T | null }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await doFetch(`${restBaseFor(creds.siteUrl)}${path}`, {
      headers: { authorization: authHeader(creds), accept: 'application/json' },
      redirect: 'follow',
      signal: controller.signal,
    });
    let body: T | null = null;
    try {
      body = (await res.json()) as T;
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Detect the active SEO plugin from the plugins endpoint (requires admin) or a graceful fallback. */
export function detectSeoPlugin(
  plugins: Array<{ plugin?: string; textdomain?: string; status?: string }> | null,
): SeoPlugin {
  if (!plugins) return null;
  const active = plugins.filter((p) => p.status === 'active' || p.status === undefined);
  const has = (needle: string) =>
    active.some(
      (p) =>
        p.plugin?.toLowerCase().includes(needle) || p.textdomain?.toLowerCase().includes(needle),
    );
  if (has('wordpress-seo') || has('yoast')) return 'yoast';
  if (has('seo-by-rank-math') || has('rank-math') || has('rankmath')) return 'rankmath';
  return null;
}

/** Epic 1.4 — test the connection: auth works, list content types, detect SEO plugin. */
export async function testConnection(
  creds: WpCredentials,
  opts: WpClientOptions = {},
): Promise<WpConnectionInfo> {
  const restBase = restBaseFor(creds.siteUrl);
  const fail = (reason: string): WpConnectionInfo => ({
    ok: false,
    restBase,
    types: [],
    seoPlugin: null,
    reason,
  });

  // 1) Is the REST API reachable at all (unauthenticated)?
  let root: { status: number; body: { name?: string; code?: string } | null };
  try {
    const doFetch = opts.fetchImpl ?? fetch;
    const res = await doFetch(restBase, { redirect: 'follow' });
    const parsed = (await res.json().catch(() => null)) as
      | { name?: string; code?: string }
      | null;
    root = { status: res.status, body: parsed };
  } catch {
    return fail(
      `Nu am putut contacta ${restBase}. Verifică URL-ul, HTTPS-ul și că site-ul e online.`,
    );
  }
  if (root.status === 404 || root.body?.code === 'rest_no_route') {
    return fail(
      `${restBase} întoarce 404. REST API pare dezactivat (plugin de securitate?) sau URL-ul e greșit.`,
    );
  }
  if (root.status >= 500) {
    return fail(`Site-ul a răspuns ${root.status} la ${restBase} (eroare de server).`);
  }

  // 2) Authenticated call.
  const me = await wpGet<{ id?: number; code?: string; message?: string }>(
    creds,
    '/wp/v2/users/me?context=edit',
    opts,
  ).catch(() => ({ status: 0, body: null }) as { status: number; body: null });

  if (me.status === 401 || me.status === 403) {
    const code = (me.body as { code?: string } | null)?.code;
    if (code === 'rest_not_logged_in' || code === 'rest_login_required') {
      return fail(
        'Header-ul Authorization nu ajunge la WordPress. Adaugă în .htaccess: ' +
          'SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1  (sau CGIPassAuth On).',
      );
    }
    return fail(
      'Autentificare respinsă. Verifică: userul e exact (case-sensitive), Application Password-ul e cel corect, ' +
        'și userul NU e blocat de un plugin de securitate (2FA, „limit login", Wordfence).',
    );
  }
  if (me.status === 0) {
    return fail('Conexiune întreruptă / timeout către WordPress.');
  }
  if (me.status !== 200 || !me.body?.id) {
    return fail(`/wp/v2/users/me a răspuns ${me.status}.`);
  }

  const typesRes = await wpGet<Record<string, unknown>>(creds, '/wp/v2/types', opts);
  const types = typesRes.body ? Object.keys(typesRes.body) : [];

  const pluginsRes = await wpGet<Array<{ plugin?: string; textdomain?: string; status?: string }>>(
    creds,
    '/wp/v2/plugins',
    opts,
  );
  const seoPlugin = detectSeoPlugin(Array.isArray(pluginsRes.body) ? pluginsRes.body : null);

  return { ok: true, restBase, types, seoPlugin };
}

async function wpPatch<T>(
  creds: WpCredentials,
  path: string,
  body: unknown,
  opts: WpClientOptions,
): Promise<{ status: number; body: T | null }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${restBaseFor(creds.siteUrl)}${path}`, {
    method: 'POST', // WP REST accepts POST for updates
    headers: {
      authorization: authHeader(creds),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  let parsed: T | null = null;
  try {
    parsed = (await res.json()) as T;
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

/** SEO-plugin-specific post-meta keys for title / description. */
export function metaKeysFor(seoPlugin: SeoPlugin): { title: string; description: string } {
  if (seoPlugin === 'yoast') {
    return { title: '_yoast_wpseo_title', description: '_yoast_wpseo_metadesc' };
  }
  if (seoPlugin === 'rankmath') {
    return { title: 'rank_math_title', description: 'rank_math_description' };
  }
  // Fallback: our own meta. Needs a companion mu-plugin to render in <head>.
  return { title: '_seo_tool_title', description: '_seo_tool_metadesc' };
}

/** Epic 6.3 — resolve a crawled URL to a WP object via its slug. */
export async function resolveObject(
  creds: WpCredentials,
  url: string,
  opts: WpClientOptions = {},
): Promise<{ type: 'post' | 'page'; id: number; slug: string } | null> {
  let slug: string;
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '');
    slug = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '');
  } catch {
    return null;
  }
  if (!slug) return null;

  for (const type of ['posts', 'pages'] as const) {
    const res = await wpGet<Array<{ id: number; slug: string }>>(
      creds,
      `/wp/v2/${type}?slug=${encodeURIComponent(slug)}&context=edit`,
      opts,
    );
    if (Array.isArray(res.body) && res.body[0]) {
      return { type: type === 'posts' ? 'post' : 'page', id: res.body[0].id, slug };
    }
  }
  return null;
}

export type FixTarget =
  | {
      kind: 'meta';
      objectType: 'post' | 'page';
      objectId: number;
      seoPlugin: SeoPlugin;
      metaTitle?: string;
      metaDescription?: string;
    }
  | { kind: 'alt'; mediaId: number; altText: string };

export interface ApplyResult {
  applied: boolean;
  /** Previous values, enough to reconstruct a rollback. */
  previous: Record<string, unknown>;
  reason?: string;
}

/** Epic 6.4/6.5 — write one safe fix, returning previous values for rollback (Epic 6.6). */
export async function applyFix(
  creds: WpCredentials,
  target: FixTarget,
  opts: WpClientOptions = {},
): Promise<ApplyResult> {
  if (target.kind === 'alt') {
    const cur = await wpGet<{ alt_text?: string }>(
      creds,
      `/wp/v2/media/${target.mediaId}?context=edit`,
      opts,
    );
    if (cur.status !== 200) return { applied: false, previous: {}, reason: `media ${cur.status}` };
    const res = await wpPatch<{ alt_text?: string }>(
      creds,
      `/wp/v2/media/${target.mediaId}`,
      { alt_text: target.altText },
      opts,
    );
    return {
      applied: res.status >= 200 && res.status < 300,
      previous: { alt_text: cur.body?.alt_text ?? '' },
      reason: res.status >= 300 ? `patch ${res.status}` : undefined,
    };
  }

  const keys = metaKeysFor(target.seoPlugin);
  const endpoint = `/wp/v2/${target.objectType}s/${target.objectId}`;
  const cur = await wpGet<{ meta?: Record<string, unknown> }>(
    creds,
    `${endpoint}?context=edit`,
    opts,
  );
  if (cur.status !== 200) return { applied: false, previous: {}, reason: `object ${cur.status}` };

  const meta: Record<string, string> = {};
  const previous: Record<string, unknown> = { seoPlugin: target.seoPlugin };
  if (target.metaTitle !== undefined) {
    meta[keys.title] = target.metaTitle;
    previous[keys.title] = cur.body?.meta?.[keys.title] ?? '';
  }
  if (target.metaDescription !== undefined) {
    meta[keys.description] = target.metaDescription;
    previous[keys.description] = cur.body?.meta?.[keys.description] ?? '';
  }

  const res = await wpPatch<unknown>(creds, endpoint, { meta }, opts);
  return {
    applied: res.status >= 200 && res.status < 300,
    previous,
    reason: res.status >= 300 ? `patch ${res.status}` : undefined,
  };
}

/** Epic 6.6 — restore previously-saved values. */
export async function rollbackFix(
  creds: WpCredentials,
  saved: { kind: 'meta' | 'alt'; objectType?: 'post' | 'page'; objectId?: number; mediaId?: number; previous: Record<string, unknown> },
  opts: WpClientOptions = {},
): Promise<{ applied: boolean }> {
  if (saved.kind === 'alt' && saved.mediaId != null) {
    const res = await wpPatch(
      creds,
      `/wp/v2/media/${saved.mediaId}`,
      { alt_text: String(saved.previous['alt_text'] ?? '') },
      opts,
    );
    return { applied: res.status >= 200 && res.status < 300 };
  }
  if (saved.kind === 'meta' && saved.objectType && saved.objectId != null) {
    const meta = Object.fromEntries(
      Object.entries(saved.previous).filter(([k]) => k !== 'seoPlugin'),
    );
    const res = await wpPatch(creds, `/wp/v2/${saved.objectType}s/${saved.objectId}`, { meta }, opts);
    return { applied: res.status >= 200 && res.status < 300 };
  }
  return { applied: false };
}
