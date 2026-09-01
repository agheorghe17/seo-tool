import { describe, expect, it } from 'vitest';
import { mdToHtml } from './markdown.js';

describe('mdToHtml', () => {
  it('converts headings, paragraphs and inline formatting', () => {
    const html = mdToHtml('# Titlu\n\nUn **paragraf** cu *accent* și un [link](https://x.ro).');
    expect(html).toContain('<h1>Titlu</h1>');
    expect(html).toContain('<strong>paragraf</strong>');
    expect(html).toContain('<em>accent</em>');
    expect(html).toContain('<a href="https://x.ro">link</a>');
  });

  it('converts unordered and ordered lists', () => {
    const html = mdToHtml('- unu\n- doi\n\n1. primul\n2. al doilea');
    expect(html).toContain('<ul>\n<li>unu</li>\n<li>doi</li>\n</ul>');
    expect(html).toContain('<ol>\n<li>primul</li>\n<li>al doilea</li>\n</ol>');
  });

  it('handles fenced code and escapes html', () => {
    const html = mdToHtml('```\n<script>alert(1)</script>\n```');
    expect(html).toContain('<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>');
  });

  it('escapes stray angle brackets in prose', () => {
    expect(mdToHtml('a < b and c > d')).toBe('<p>a &lt; b and c &gt; d</p>');
  });

  it('produces a blockquote and hr', () => {
    const html = mdToHtml('> citat\n\n---');
    expect(html).toContain('<blockquote><p>citat</p></blockquote>');
    expect(html).toContain('<hr />');
  });
});
