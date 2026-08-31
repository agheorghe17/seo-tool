import type { Browser } from 'playwright-core';
import type { PageData } from 'shared';
import { extractPage } from './extract.js';
import { assertSafeCrawlUrl } from './ssrf.js';

/**
 * Epic 3.1 — headless render fallback for JS-heavy pages.
 *
 * Playwright is an OPTIONAL dependency and Chromium is heavy; on the Fly free tier it may not fit
 * (see EPICS.md 3.1.3). It's lazy-imported here so installs and the rest of the crawler never
 * need it. When rendering is unavailable the worker keeps the static extraction and files an issue.
 */

export interface RenderOptions {
  userAgent: string;
  timeoutMs?: number;
  /** Block heavy resources for speed. */
  blockResources?: boolean;
}

export class RenderUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Playwright rendering is unavailable (optional dependency not installed)');
    this.name = 'RenderUnavailableError';
    this.cause = cause;
  }
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      let chromium;
      try {
        ({ chromium } = await import('playwright-core'));
      } catch (err) {
        throw new RenderUnavailableError(err);
      }
      return chromium.launch({ headless: true });
    })();
  }
  return browserPromise;
}

export async function closeRenderer(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    await browser?.close();
    browserPromise = null;
  }
}

/** Render a URL with a real browser and return structured `PageData` (rendered_with = 'playwright'). */
export async function renderPage(url: string, opts: RenderOptions): Promise<PageData> {
  assertSafeCrawlUrl(url);
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: opts.userAgent });
  const page = await context.newPage();

  if (opts.blockResources ?? true) {
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') return route.abort();
      return route.continue();
    });
  }

  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: opts.timeoutMs ?? 20_000,
    });
    const html = await page.content();
    const finalUrl = page.url();
    const status = response?.status() ?? 0;
    const headers = response ? await response.allHeaders() : {};

    const data = extractPage({
      finalUrl,
      statusCode: status,
      redirectChain: [],
      html,
      headers,
    });
    return { ...data, renderedWith: 'playwright' };
  } finally {
    await context.close();
  }
}
