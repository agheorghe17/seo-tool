import { describe, expect, it } from 'vitest';
import { extractInternalLinks, extractPage, looksJsHeavy } from './extract.js';

const HTML = `<!doctype html>
<html>
<head>
  <title>  Widgets for sale  </title>
  <meta name="description" content="The best widgets around.">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="/widgets">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Widget"}</script>
  <script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"},{"@type":["FAQPage","WebPage"]}]}</script>
</head>
<body>
  <nav><a href="/nav-link">nav</a></nav>
  <main>
    <h1>Widgets</h1>
    <h2>Blue widgets</h2>
    <p>We sell many ${'word '.repeat(60)} widgets here.</p>
    <img src="/a.png" alt="A widget">
    <img src="/b.png">
    <a href="/about">About</a>
    <a href="https://other.example.com/x">External</a>
    <a href="mailto:x@y.z">mail</a>
  </main>
  <footer>footer text</footer>
</body>
</html>`;

const base = {
  finalUrl: 'https://example.com/widgets',
  statusCode: 200,
  redirectChain: [],
  headers: {},
};

describe('extractPage', () => {
  const page = extractPage({ ...base, html: HTML });

  it('pulls title, meta, h1, canonical', () => {
    expect(page.title).toBe('Widgets for sale');
    expect(page.metaDescription).toBe('The best widgets around.');
    expect(page.h1).toBe('Widgets');
    expect(page.canonicalUrl).toBe('https://example.com/widgets');
  });

  it('counts headings and words from main content only', () => {
    expect(page.headings.filter((h) => h.level === 1)).toHaveLength(1);
    expect(page.headings.some((h) => h.level === 2)).toBe(true);
    expect(page.wordCount).toBeGreaterThan(50);
  });

  it('collects images with alt (null when missing)', () => {
    expect(page.images).toEqual([
      { src: 'https://example.com/a.png', alt: 'A widget' },
      { src: 'https://example.com/b.png', alt: null },
    ]);
  });

  it('separates internal and external links', () => {
    expect(page.internalLinksCount).toBe(2); // /nav-link + /about
    expect(page.externalLinksCount).toBe(1);
  });

  it('captures internal links with anchor text and trimmed main text', () => {
    expect(page.internalLinks).toEqual(
      expect.arrayContaining([
        { url: 'https://example.com/nav-link', anchor: 'nav' },
        { url: 'https://example.com/about', anchor: 'About' },
      ]),
    );
    expect(page.mainText).toContain('widgets here');
    expect((page.mainText ?? '').length).toBeLessThanOrEqual(8000);
  });

  it('flattens JSON-LD @type including @graph and arrays', () => {
    expect(page.schemaTypes.sort()).toEqual(
      ['BreadcrumbList', 'FAQPage', 'Product', 'WebPage'].sort(),
    );
  });

  it('is indexable, and content hash is stable + case-insensitive', () => {
    expect(page.indexability).toBe('indexable');
    const again = extractPage({ ...base, html: HTML.toUpperCase() });
    expect(again.contentHash).toBe(page.contentHash);
  });

  it('honours noindex from meta and X-Robots-Tag', () => {
    const meta = extractPage({
      ...base,
      html: HTML.replace('index,follow', 'noindex, follow'),
    });
    expect(meta.indexability).toBe('noindex');
    const header = extractPage({ ...base, headers: { 'x-robots-tag': 'noindex' }, html: HTML });
    expect(header.indexability).toBe('noindex');
  });
});

describe('looksJsHeavy', () => {
  it('flags an empty shell with an app root', () => {
    const html = '<html><body><div id="__next"></div><script src="/a.js"></script></body></html>';
    const page = extractPage({ ...base, html });
    expect(looksJsHeavy(page, html)).toBe(true);
  });

  it('does not flag a content-rich page', () => {
    const page = extractPage({ ...base, html: HTML });
    expect(looksJsHeavy(page, HTML)).toBe(false);
  });
});

describe('extractInternalLinks', () => {
  it('returns same-host links without fragments', () => {
    const links = extractInternalLinks(HTML, 'https://example.com/widgets');
    expect(links).toEqual(
      expect.arrayContaining(['https://example.com/about', 'https://example.com/nav-link']),
    );
    expect(links).not.toContain('https://other.example.com/x');
  });
});
