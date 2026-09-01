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

const QUESTION_STARTERS =
  /^(cum|ce|de ce|c[âa]nd|care|c[âa]t|c[âa]te|c[âa]ți|unde|cine|is|what|why|how|when|where|which|who|does|can|should)\b/i;

function isQuestionHeading(text: string): boolean {
  const t = text.trim();
  return t.endsWith('?') || QUESTION_STARTERS.test(t);
}

/**
 * Epic 21 — "answer-ready" gap. Pages that pose questions in their headings but don't
 * mark them up as FAQ/QA schema miss AI Overviews / answer-engine extraction.
 */
export const answerReadyRule: Rule = {
  id: 'geo.answer-ready',
  version: 1,
  category: 'geo',
  severity: 'info',
  fixTitle: 'Marchează întrebările din pagină ca FAQ (schema FAQPage) cu răspunsuri scurte',
  impactHint: 3,
  effortHint: 2,
  penalty: 22,
  check(page) {
    const questions = page.headings.filter((h) => h.level >= 2 && isQuestionHeading(h.text));
    if (questions.length < 2) return { passed: true };
    const marked = page.schemaTypes.some((t) => t === 'FAQPage' || t === 'QAPage');
    return marked
      ? { passed: true }
      : {
          passed: false,
          description: `${questions.length} întrebări în titluri, fără schema FAQ — nefolosibile ca răspuns în AI Overviews.`,
          detectedValue: String(questions.length),
        };
  },
};

/**
 * Epic 21 — a short summary near the top of long pages is the block AI answer engines
 * quote most often.
 */
export const tldrRule: Rule = {
  id: 'geo.tldr',
  version: 1,
  category: 'geo',
  severity: 'info',
  fixTitle: 'Adaugă un rezumat „Pe scurt" în partea de sus a paginilor lungi',
  impactHint: 2,
  effortHint: 2,
  penalty: 15,
  check(page) {
    if (page.wordCount < 600) return { passed: true };
    const topHeadings = page.headings.filter((h) => h.level >= 2).slice(0, 4);
    const hasTldr = topHeadings.some((h) =>
      /(pe scurt|rezumat|tl;?dr|key takeaways|concluzii|în rezumat|pe scurt despre)/i.test(h.text),
    );
    return hasTldr
      ? { passed: true }
      : {
          passed: false,
          description: `Pagină lungă (${page.wordCount} cuvinte) fără un rezumat „Pe scurt" în partea de sus.`,
          detectedValue: null,
        };
  },
};

export const geoRules: Rule[] = [
  schemaPresentRule,
  answerableSchemaRule,
  scannableRule,
  answerReadyRule,
  tldrRule,
];
