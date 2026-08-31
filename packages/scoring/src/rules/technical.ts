import type { Rule } from '../rule.js';

/** Epic 4.2 — technical rules (default category weight 30%). */

function stripUrl(u: string): string {
  try {
    const url = new URL(u);
    return `${url.host}${url.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

export const statusOkRule: Rule = {
  id: 'technical.status-ok',
  version: 1,
  category: 'technical',
  severity: 'critical',
  fixTitle: 'Asigură cod de răspuns 200 pentru paginile indexabile',
  impactHint: 5,
  effortHint: 3,
  penalty: 60,
  check(page) {
    if (page.statusCode >= 200 && page.statusCode < 300) return { passed: true };
    return {
      passed: false,
      description: `Pagina răspunde cu status ${page.statusCode}.`,
      detectedValue: String(page.statusCode),
    };
  },
};

export const httpsRule: Rule = {
  id: 'technical.https',
  version: 1,
  category: 'technical',
  severity: 'critical',
  fixTitle: 'Servește pagina prin HTTPS',
  impactHint: 5,
  effortHint: 3,
  penalty: 40,
  check(page) {
    return page.url.startsWith('https://')
      ? { passed: true }
      : { passed: false, description: 'Pagina nu este servită prin HTTPS.', detectedValue: page.url };
  },
};

export const redirectChainRule: Rule = {
  id: 'technical.redirect-chain',
  version: 1,
  category: 'technical',
  severity: 'warning',
  fixTitle: 'Elimină lanțurile de redirect-uri',
  impactHint: 3,
  effortHint: 2,
  penalty: 15,
  check(page) {
    if (page.redirectChain.length <= 1) return { passed: true };
    return {
      passed: false,
      description: `Pagina trece prin ${page.redirectChain.length} redirect-uri.`,
      detectedValue: String(page.redirectChain.length),
    };
  },
};

export const indexableRule: Rule = {
  id: 'technical.indexable',
  version: 1,
  category: 'technical',
  severity: 'warning',
  fixTitle: 'Verifică directiva noindex dacă pagina ar trebui indexată',
  impactHint: 4,
  effortHint: 1,
  penalty: 30,
  check(page) {
    if (page.indexability === 'indexable') return { passed: true };
    return {
      passed: false,
      description: `Pagina are indexability = ${page.indexability}.`,
      detectedValue: page.indexability,
    };
  },
};

export const canonicalRule: Rule = {
  id: 'technical.canonical',
  version: 1,
  category: 'technical',
  severity: 'info',
  fixTitle: 'Aliniază URL-ul canonic cu URL-ul paginii',
  impactHint: 2,
  effortHint: 2,
  penalty: 10,
  check(page) {
    if (!page.canonicalUrl) return { passed: true };
    if (stripUrl(page.canonicalUrl) === stripUrl(page.url)) return { passed: true };
    return {
      passed: false,
      description: 'URL-ul canonic diferă de URL-ul paginii.',
      detectedValue: page.canonicalUrl,
    };
  },
};

export const duplicateContentRule: Rule = {
  id: 'technical.duplicate-content',
  version: 1,
  category: 'technical',
  severity: 'warning',
  fixTitle: 'Rezolvă conținutul duplicat între URL-uri',
  impactHint: 4,
  effortHint: 3,
  penalty: 20,
  check(page, ctx) {
    if (!page.contentHash || page.wordCount < 50) return { passed: true };
    const dup = ctx.siblings.find(
      (s) => s.url !== page.url && s.contentHash === page.contentHash && s.wordCount >= 50,
    );
    return dup
      ? {
          passed: false,
          description: 'Altă pagină din crawl are exact același conținut.',
          detectedValue: dup.url,
        }
      : { passed: true };
  },
};

export const technicalRules: Rule[] = [
  statusOkRule,
  httpsRule,
  redirectChainRule,
  indexableRule,
  canonicalRule,
  duplicateContentRule,
];
