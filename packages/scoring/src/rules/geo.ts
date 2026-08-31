import type { Rule } from '../rule.js';

/** Epic 4.6 — GEO / AI-readiness rules (default category weight 10%). */

const ANSWER_SCHEMA = ['FAQPage', 'QAPage', 'HowTo', 'Article', 'NewsArticle', 'BlogPosting'];

export const schemaPresentRule: Rule = {
  id: 'geo.schema-present',
  version: 1,
  category: 'geo',
  severity: 'warning',
  fixTitle: 'Adaugă schema markup (JSON-LD) relevant paginii',
  impactHint: 3,
  effortHint: 2,
  penalty: 40,
  check(page) {
    return page.schemaTypes.length > 0
      ? { passed: true }
      : { passed: false, description: 'Pagina nu are schema markup (JSON-LD).', detectedValue: null };
  },
};

export const answerableSchemaRule: Rule = {
  id: 'geo.answerable-schema',
  version: 1,
  category: 'geo',
  severity: 'info',
  fixTitle: 'Adaugă schema de tip Article / FAQ / HowTo pentru fragmente extractibile',
  impactHint: 3,
  effortHint: 2,
  penalty: 25,
  check(page) {
    const has = page.schemaTypes.some((t) => ANSWER_SCHEMA.includes(t));
    return has
      ? { passed: true }
      : {
          passed: false,
          description: 'Lipsește o schemă orientată pe răspuns (Article/FAQPage/HowTo).',
          detectedValue: page.schemaTypes.join(', ') || null,
        };
  },
};

export const scannableRule: Rule = {
  id: 'geo.scannable',
  version: 1,
  category: 'geo',
  severity: 'info',
  fixTitle: 'Structurează conținutul cu subtitluri clare (H2/H3)',
  impactHint: 2,
  effortHint: 2,
  penalty: 20,
  check(page) {
    const subs = page.headings.filter((h) => h.level === 2 || h.level === 3).length;
    if (page.wordCount < 300) return { passed: true }; // short pages don't need many subheads
    return subs >= 2
      ? { passed: true }
      : {
          passed: false,
          description: `Conținut lung (${page.wordCount} cuvinte) cu doar ${subs} subtitluri H2/H3.`,
          detectedValue: String(subs),
        };
  },
};

export const geoRules: Rule[] = [schemaPresentRule, answerableSchemaRule, scannableRule];
