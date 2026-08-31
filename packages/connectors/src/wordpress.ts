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

  const me = await wpGet<{ id?: number }>(creds, '/wp/v2/users/me?context=edit', opts).catch(
    (err) => ({ status: 0, body: null, err }) as { status: number; body: null },
  );
  if (me.status === 401 || me.status === 403) {
    return { ok: false, restBase, types: [], seoPlugin: null, reason: 'Autentificare respinsă (user sau Application Password greșit)' };
  }
  if (me.status !== 200 || !me.body?.id) {
    return {
      ok: false,
      restBase,
      types: [],
      seoPlugin: null,
      reason: me.status === 0 ? 'Nu am putut contacta site-ul WordPress' : `REST API a răspuns ${me.status}`,
    };
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

export interface ApplyMetaInput {
  creds: WpCredentials;
  objectType: 'post' | 'page' | 'media';
  objectId: number;
  fields: Partial<{ title: string; metaTitle: string; metaDescription: string; altText: string }>;
}

export interface ApplyResult {
  applied: boolean;
  previous: Record<string, unknown>;
}

/** Epic 6.4/6.5 — write a safe fix, returning the previous values for rollback. */
export async function applyMeta(_input: ApplyMetaInput): Promise<ApplyResult> {
  throw new Error('not implemented — Epic 6.4');
}
