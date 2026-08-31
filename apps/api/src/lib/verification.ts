/**
 * Epic 1.2/1.3 — universal site-ownership verification.
 *
 * Three methods, same as Google Search Console:
 *   - meta_tag : <meta name="seo-tool-verification" content="{token}"> in the homepage <head>
 *   - html_file: GET https://{domain}/{token}.html returns a body containing {token}
 *   - dns_txt  : a TXT record "seo-tool-verification={token}" on the apex domain
 *
 * Network + DNS access is injected so the logic is unit-testable against a fixture server.
 */
import { resolveTxt as nodeResolveTxt } from 'node:dns/promises';
import type { VerificationMethod } from 'shared';
import { assertSafeCrawlUrl } from 'crawler';

export const META_NAME = 'seo-tool-verification';
export const DNS_PREFIX = 'seo-tool-verification=';

export interface VerificationDeps {
  fetch: typeof fetch;
  resolveTxt: (hostname: string) => Promise<string[][]>;
  /** Cap on bytes read from a page body. */
  maxBytes?: number;
}

export interface VerificationOutcome {
  verified: boolean;
  method: VerificationMethod;
  /** Present when `verified` is false — a short, user-facing reason. */
  reason?: string;
  /** What we actually observed (for debugging in the UI). */
  detail?: string;
}

const defaultDeps = (): VerificationDeps => ({
  fetch,
  resolveTxt: nodeResolveTxt,
  maxBytes: 512 * 1024,
});

/** True if `html` contains a <meta> tag with the given name + content, attributes in any order. */
export function htmlHasMetaVerification(html: string, name: string, content: string): boolean {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const nameMatch = tag.match(/\bname\s*=\s*["']([^"']*)["']/i);
    const contentMatch = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (
      nameMatch?.[1]?.trim().toLowerCase() === name.toLowerCase() &&
      contentMatch?.[1]?.trim() === content
    ) {
      return true;
    }
  }
  return false;
}

async function readBody(res: Response, maxBytes: number): Promise<string> {
  const buf = await res.arrayBuffer();
  return Buffer.from(buf.slice(0, maxBytes)).toString('utf8');
}

async function verifyMetaTag(
  domain: string,
  token: string,
  deps: VerificationDeps,
): Promise<VerificationOutcome> {
  const url = `https://${domain}/`;
  assertSafeCrawlUrl(url);
  try {
    const res = await deps.fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      return { verified: false, method: 'meta_tag', reason: `Homepage a răspuns ${res.status}` };
    }
    const html = await readBody(res, deps.maxBytes ?? 512 * 1024);
    if (htmlHasMetaVerification(html, META_NAME, token)) {
      return { verified: true, method: 'meta_tag' };
    }
    return {
      verified: false,
      method: 'meta_tag',
      reason: 'Meta tag-ul de verificare nu a fost găsit în <head>',
    };
  } catch (err) {
    return { verified: false, method: 'meta_tag', reason: 'Nu am putut încărca homepage-ul', detail: String(err) };
  }
}

async function verifyHtmlFile(
  domain: string,
  token: string,
  deps: VerificationDeps,
): Promise<VerificationOutcome> {
  const url = `https://${domain}/${token}.html`;
  assertSafeCrawlUrl(url);
  try {
    const res = await deps.fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      return {
        verified: false,
        method: 'html_file',
        reason: `Fișierul de verificare a răspuns ${res.status}`,
      };
    }
    const body = (await readBody(res, deps.maxBytes ?? 512 * 1024)).trim();
    if (body.includes(token)) {
      return { verified: true, method: 'html_file' };
    }
    return {
      verified: false,
      method: 'html_file',
      reason: 'Fișierul există dar nu conține token-ul corect',
    };
  } catch (err) {
    return {
      verified: false,
      method: 'html_file',
      reason: 'Nu am putut încărca fișierul de verificare',
      detail: String(err),
    };
  }
}

async function verifyDnsTxt(
  domain: string,
  token: string,
  deps: VerificationDeps,
): Promise<VerificationOutcome> {
  const apex = domain.replace(/^www\./, '');
  try {
    const records = await deps.resolveTxt(apex);
    const flat = records.map((chunks) => chunks.join(''));
    if (flat.some((r) => r.trim() === `${DNS_PREFIX}${token}`)) {
      return { verified: true, method: 'dns_txt' };
    }
    return {
      verified: false,
      method: 'dns_txt',
      reason: 'Înregistrarea TXT de verificare nu a fost găsită',
      detail: flat.filter((r) => r.startsWith('seo-tool-verification')).join(', ') || undefined,
    };
  } catch (err) {
    return {
      verified: false,
      method: 'dns_txt',
      reason: 'Nu am putut interoga înregistrările DNS TXT',
      detail: String(err),
    };
  }
}

export function verifyOwnership(
  method: VerificationMethod,
  domain: string,
  token: string,
  deps: VerificationDeps = defaultDeps(),
): Promise<VerificationOutcome> {
  switch (method) {
    case 'meta_tag':
      return verifyMetaTag(domain, token, deps);
    case 'html_file':
      return verifyHtmlFile(domain, token, deps);
    case 'dns_txt':
      return verifyDnsTxt(domain, token, deps);
  }
}
