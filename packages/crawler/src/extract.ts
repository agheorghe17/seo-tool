import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import type { HeadingNode, Indexability, PageData, PageImage } from 'shared';

/** Epic 2.4/2.5/2.9 — turn a fetched HTML document into structured `PageData`. */

export interface ExtractInput {
  finalUrl: string;
  statusCode: number;
  redirectChain: string[];
  html: string;
  /** Lower-cased response headers — used for `X-Robots-Tag`. */
  headers: Record<string, string>;
}

const BOILERPLATE = 'script,style,noscript,template,svg,nav,header,footer,aside,form';

function mainText($: cheerio.CheerioAPI): string {
  const scope = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('body');
  const clone = scope.clone();
  clone.find(BOILERPLATE).remove();
  return clone.text().replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function collectSchemaTypes($: cheerio.CheerioAPI): string[] {
  const types = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    try {
      const json = JSON.parse(raw);
      walkSchema(json, types);
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  return [...types];
}

function walkSchema(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) walkSchema(item, out);
    return;
  }
  if (node && typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    const t = rec['@type'];
    if (typeof t === 'string') out.add(t);
    if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') out.add(x);
    if (rec['@graph']) walkSchema(rec['@graph'], out);
  }
}

function resolveIndexability(
  $: cheerio.CheerioAPI,
  headers: Record<string, string>,
): Indexability {
  const metaRobots = $('meta[name="robots"]').attr('content')?.toLowerCase() ?? '';
  const xRobots = (headers['x-robots-tag'] ?? '').toLowerCase();
  if (/\bnoindex\b/.test(metaRobots) || /\bnoindex\b/.test(xRobots)) return 'noindex';
  return 'indexable';
}

export function extractPage(input: ExtractInput): PageData {
  const $ = cheerio.load(input.html);
  const base = new URL(input.finalUrl);

  const headings: HeadingNode[] = [];
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    const level = Number(el.tagName.slice(1)) as HeadingNode['level'];
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text) headings.push({ level, text });
  });

  const images: PageImage[] = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') ?? $(el).attr('data-src') ?? '';
    if (!src) return;
    let abs = src;
    try {
      abs = new URL(src, base).toString();
    } catch {
      /* keep raw */
    }
    const altAttr = $(el).attr('alt');
    images.push({ src: abs, alt: altAttr === undefined ? null : altAttr });
  });

  let internal = 0;
  let external = 0;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')!;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    try {
      const u = new URL(href, base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
      if (u.host === base.host) internal++;
      else external++;
    } catch {
      /* ignore */
    }
  });

  const text = mainText($);
  const contentHash = createHash('sha256').update(text.toLowerCase()).digest('hex');

  const canonicalRaw = $('link[rel="canonical"]').attr('href') ?? null;
  let canonicalUrl: string | null = null;
  if (canonicalRaw) {
    try {
      canonicalUrl = new URL(canonicalRaw, base).toString();
    } catch {
      canonicalUrl = canonicalRaw;
    }
  }

  const title = $('head > title').first().text().trim() || $('title').first().text().trim() || null;
  const h1 = headings.find((h) => h.level === 1)?.text ?? null;

  return {
    url: input.finalUrl,
    statusCode: input.statusCode,
    redirectChain: input.redirectChain,
    indexability: resolveIndexability($, input.headers),
    renderedWith: 'static',
    contentHash,
    title,
    metaDescription: $('meta[name="description"]').attr('content')?.trim() || null,
    h1,
    headings,
    wordCount: countWords(text),
    canonicalUrl,
    schemaTypes: collectSchemaTypes($),
    images,
    internalLinksCount: internal,
    externalLinksCount: external,
    lcpMs: null,
    inpMs: null,
    clsScore: null,
    mobileFriendly: null,
  };
}

/**
 * Epic 2.9 — heuristic: does this page look like it needs JS rendering?
 * Very little visible text but a real HTML shell / heavy script usage.
 */
export function looksJsHeavy(page: PageData, html: string): boolean {
  if (page.wordCount >= 120) return false;
  const scriptCount = (html.match(/<script\b/gi) ?? []).length;
  const hasAppRoot = /<div[^>]+id=["'](root|app|__next|__nuxt)["']/i.test(html);
  return hasAppRoot || scriptCount >= 5;
}

/** Extract same-host page links for the BFS fallback (Epic 2.1.2). */
export function extractInternalLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const out = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')!;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    try {
      const u = new URL(href, base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
      if (u.host !== base.host) return;
      u.hash = '';
      out.add(u.toString());
    } catch {
      /* ignore */
    }
  });
  return [...out];
}
