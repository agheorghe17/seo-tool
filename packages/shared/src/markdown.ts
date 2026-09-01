/**
 * Epic 21 — minimal Markdown → HTML for the assisted-content flow. Covers what an LLM
 * article uses: headings, bold/italic, links, lists, blockquotes, fenced code, hr,
 * paragraphs. The output is posted to WordPress as a DRAFT the user reviews, so this
 * deliberately stays small rather than pulling a full CommonMark dependency.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  return out;
}

export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let para: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;
  const code: string[] = [];

  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${inline(para.join(' ').trim())}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw;

    if (line.trim().startsWith('```')) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code.length = 0;
        inCode = false;
      } else {
        flushPara();
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1]!.length;
      html.push(`<h${level}>${inline(heading[2]!.trim())}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushPara();
      flushList();
      html.push('<hr />');
      continue;
    }

    const blockquote = line.match(/^>\s?(.*)$/);
    if (blockquote) {
      flushPara();
      flushList();
      html.push(`<blockquote><p>${inline(blockquote[1]!.trim())}</p></blockquote>`);
      continue;
    }

    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ol || ul) {
      flushPara();
      const want: 'ul' | 'ol' = ol ? 'ol' : 'ul';
      if (listType && listType !== want) flushList();
      if (!listType) {
        listType = want;
        html.push(`<${want}>`);
      }
      html.push(`<li>${inline((ol ?? ul)![1]!.trim())}</li>`);
      continue;
    }

    para.push(line.trim());
  }

  if (inCode && code.length) html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushPara();
  flushList();
  return html.join('\n');
}
