import { request } from 'undici';
import { assertSafeCrawlUrl } from './ssrf.js';

/** Epic 2.3 — static fetch with manual redirect following, so we capture the full chain. */

export interface FetchOptions {
  userAgent: string;
  maxRedirects?: number;
  headersTimeoutMs?: number;
  bodyTimeoutMs?: number;
  maxBytes?: number;
}

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  /** Ordered list of URLs redirected THROUGH (empty when there was no redirect). */
  redirectChain: string[];
  headers: Record<string, string>;
  contentType: string | null;
  isHtml: boolean;
  body: string;
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function headerValue(v: string | string[] | undefined): string | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function fetchStatic(url: string, opts: FetchOptions): Promise<FetchResult> {
  const maxRedirects = opts.maxRedirects ?? 10;
  const maxBytes = opts.maxBytes ?? 3 * 1024 * 1024;
  const redirectChain: string[] = [];

  let current = url;
  assertSafeCrawlUrl(current);

  for (let hop = 0; ; hop++) {
    const res = await request(current, {
      method: 'GET',
      headers: { 'user-agent': opts.userAgent, accept: 'text/html,application/xhtml+xml' },
      headersTimeout: opts.headersTimeoutMs ?? 15_000,
      bodyTimeout: opts.bodyTimeoutMs ?? 20_000,
    });

    if (REDIRECT_CODES.has(res.statusCode) && hop < maxRedirects) {
      const location = headerValue(res.headers['location']);
      res.body.dump();
      if (!location) {
        return finalise(url, current, res.statusCode, redirectChain, res.headers, '', false);
      }
      const next = new URL(location, current).toString();
      assertSafeCrawlUrl(next);
      redirectChain.push(next);
      current = next;
      continue;
    }

    const contentType = headerValue(res.headers['content-type']);
    const isHtml = !!contentType && /text\/html|application\/xhtml\+xml/i.test(contentType);

    let body = '';
    if (isHtml) {
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of res.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        chunks.push(buf);
        if (total >= maxBytes) break;
      }
      body = Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8');
    } else {
      res.body.dump();
    }

    return finalise(url, current, res.statusCode, redirectChain, res.headers, body, isHtml, contentType);
  }
}

function finalise(
  requestedUrl: string,
  finalUrl: string,
  statusCode: number,
  redirectChain: string[],
  rawHeaders: Record<string, string | string[] | undefined>,
  body: string,
  isHtml: boolean,
  contentType: string | null = null,
): FetchResult {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    const val = headerValue(v);
    if (val != null) headers[k.toLowerCase()] = val;
  }
  return { requestedUrl, finalUrl, statusCode, redirectChain, headers, contentType, isHtml, body };
}
