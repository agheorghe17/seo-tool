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

export const SEO_AUDIT_NS = 'seo-audit/v1';

export interface WpConnectionInfo {
  ok: boolean;
  restBase: string;
  types: string[];
  seoPlugin: SeoPlugin;
  /** True when the SEO Audit Connector plugin is installed (preferred integration path). */
  connectorPlugin?: boolean;
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

interface ConnectorPing {
  ok?: boolean;
  seo_plugin?: SeoPlugin;
  types?: string[];
  user?: { caps?: Record<string, boolean> };
}

/** Preferred path: the SEO Audit Connector plugin's own namespace (works even if wp/v2 is locked). */
async function connectorPing(
  creds: WpCredentials,
  opts: WpClientOptions,
): Promise<{ status: number; body: ConnectorPing | null }> {
  return wpGet<ConnectorPing>(creds, `/${SEO_AUDIT_NS}/ping`, opts).catch(
    () => ({ status: 0, body: null }) as { status: number; body: null },
  );
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

  // 0) Prefer the companion plugin's endpoint — it also fixes the Authorization header.
  const ping = await connectorPing(creds, opts);
  if (ping.status === 200 && ping.body?.ok) {
    return {
      ok: true,
      restBase,
      types: ping.body.types ?? [],
      seoPlugin: ping.body.seo_plugin ?? null,
      connectorPlugin: true,
    };
  }
  if (ping.status === 401 || ping.status === 403) {
    // Plugin is installed but auth failed — the message is unambiguous here.
    return fail(
      'Pluginul SEO Audit Connector e instalat, dar autentificarea a fost respinsă. ' +
        'Regenerează parola din Setări → SEO Audit și verifică utilizatorul.',
    );
  }

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
        'Header-ul Authorization nu ajunge la WordPress. Instalează pluginul „SEO Audit Connector" ' +
          '(îl repară automat) sau adaugă în .htaccess: SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1.',
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

async function wpPost<T>(
  creds: WpCredentials,
  path: string,
  body: unknown,
  opts: WpClientOptions,
): Promise<{ status: number; body: T | null }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${restBaseFor(creds.siteUrl)}${path}`, {
    method: 'POST',
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

export interface DraftPostInput {
  title: string;
  contentHtml: string;
  slug?: string;
  excerpt?: string;
}

export interface DraftPostResult {
  ok: boolean;
  postId?: number;
  editLink?: string;
  link?: string;
  reason?: string;
}

/**
 * Epic 21 — create a WordPress post as a DRAFT (never published live). The user
 * reviews and publishes from WordPress itself. Assisted-content flow only.
 */
export async function createDraftPost(
  creds: WpCredentials,
  input: DraftPostInput,
  opts: WpClientOptions = {},
): Promise<DraftPostResult> {
  const res = await wpPost<{
    id?: number;
    link?: string;
    code?: string;
    message?: string;
    guid?: { rendered?: string };
  }>(
    creds,
    '/wp/v2/posts',
    {
      status: 'draft', // hard-coded — this function never publishes
      title: input.title,
      content: input.contentHtml,
      ...(input.slug ? { slug: input.slug } : {}),
      ...(input.excerpt ? { excerpt: input.excerpt } : {}),
    },
    opts,
  ).catch(() => ({ status: 0, body: null }) as { status: number; body: null });

  if (res.status === 201 || (res.status === 200 && res.body?.id)) {
    const id = res.body?.id;
    return {
      ok: true,
      postId: id,
      link: res.body?.link,
      editLink: id ? `${normaliseSiteUrl(creds.siteUrl)}/wp-admin/post.php?post=${id}&action=edit` : undefined,
    };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'Userul WordPress nu are permisiunea de a crea articole (edit_posts).' };
  }
  return {
    ok: false,
    reason: res.body?.message ?? `WordPress a răspuns ${res.status} la crearea articolului.`,
  };
}

/** Update the body/title of an existing draft (keeps it a draft). */
export async function updateDraftPost(
  creds: WpCredentials,
  postId: number,
  input: Partial<DraftPostInput>,
  opts: WpClientOptions = {},
): Promise<DraftPostResult> {
  const res = await wpPost<{ id?: number; link?: string; message?: string }>(
    creds,
    `/wp/v2/posts/${postId}`,
    {
      ...(input.title != null ? { title: input.title } : {}),
      ...(input.contentHtml != null ? { content: input.contentHtml } : {}),
      ...(input.slug ? { slug: input.slug } : {}),
    },
    opts,
  ).catch(() => ({ status: 0, body: null }) as { status: number; body: null });
  if (res.status >= 200 && res.status < 300 && res.body?.id) {
    return {
      ok: true,
      postId: res.body.id,
      link: res.body.link,
      editLink: `${normaliseSiteUrl(creds.siteUrl)}/wp-admin/post.php?post=${res.body.id}&action=edit`,
    };
  }
  return { ok: false, reason: res.body?.message ?? `update ${res.status}` };
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

/** Epic 6.3 — resolve a crawled URL to a WP object. Prefers the connector plugin. */
export async function resolveObject(
  creds: WpCredentials,
  url: string,
  opts: WpClientOptions = {},
): Promise<{ type: 'post' | 'page'; id: number; slug: string } | null> {
  // Preferred: the companion plugin (does a real url_to_postid()).
  const viaPlugin = await wpGet<{ id?: number; type?: string; slug?: string }>(
    creds,
    `/${SEO_AUDIT_NS}/resolve?url=${encodeURIComponent(url)}`,
    opts,
  ).catch(() => ({ status: 0, body: null }) as { status: number; body: null });
  if (viaPlugin.status === 200 && viaPlugin.body?.id) {
    return {
      type: viaPlugin.body.type === 'page' ? 'page' : 'post',
      id: viaPlugin.body.id,
      slug: viaPlugin.body.slug ?? '',
    };
  }

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
  // Preferred: the companion plugin's /apply (works when wp/v2 writes are blocked).
  const pluginBody =
    target.kind === 'alt'
      ? { kind: 'alt', media_id: target.mediaId, alt_text: target.altText }
      : {
          kind: 'meta',
          object_type: target.objectType,
          object_id: target.objectId,
          ...(target.metaTitle !== undefined ? { meta_title: target.metaTitle } : {}),
          ...(target.metaDescription !== undefined
            ? { meta_description: target.metaDescription }
            : {}),
        };
  const viaPlugin = await wpPatch<{ applied?: boolean; previous?: Record<string, unknown> }>(
    creds,
    `/${SEO_AUDIT_NS}/apply`,
    pluginBody,
    opts,
  ).catch(() => ({ status: 0, body: null }) as { status: number; body: null });
  if (viaPlugin.status === 200 && viaPlugin.body?.applied) {
    return { applied: true, previous: viaPlugin.body.previous ?? {} };
  }
  if (viaPlugin.status === 403) {
    return {
      applied: false,
      previous: {},
      reason: 'Userul nu are permisiuni suficiente (edit_posts / upload_files).',
    };
  }

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
  // Preferred: the companion plugin's /rollback.
  const viaPlugin = await wpPatch<{ rolled_back?: boolean }>(
    creds,
    `/${SEO_AUDIT_NS}/rollback`,
    {
      kind: saved.kind,
      object_type: saved.objectType,
      object_id: saved.objectId,
      media_id: saved.mediaId,
      previous: saved.previous,
    },
    opts,
  ).catch(() => ({ status: 0, body: null }) as { status: number; body: null });
  if (viaPlugin.status === 200 && viaPlugin.body?.rolled_back) {
    return { applied: true };
  }

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
