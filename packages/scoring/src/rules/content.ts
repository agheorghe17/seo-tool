import type { Rule } from '../rule.js';

/** Epic 4.5 — content rules (default category weight 20%). */

export const thinContentRule: Rule = {
  id: 'content.thin',
  version: 1,
  category: 'content',
  severity: 'warning',
  fixTitle: 'Dezvoltă conținutul paginii pentru a acoperi intenția căutării',
  impactHint: 4,
  effortHint: 4,
  penalty: 40,
  check(page) {
    if (page.wordCount >= 250) return { passed: true };
    return {
      passed: false,
      description: `Pagina are ${page.wordCount} cuvinte în conținutul principal (recomandat > 250).`,
      detectedValue: String(page.wordCount),
    };
  },
};

export const duplicateTitleRule: Rule = {
  id: 'content.duplicate-title',
  version: 1,
  category: 'content',
  severity: 'warning',
  fixTitle: 'Fă title-urile unice pe site',
  impactHint: 3,
  effortHint: 2,
  penalty: 20,
  check(page, ctx) {
    const title = page.title?.trim().toLowerCase();
    if (!title) return { passed: true };
    const dup = ctx.siblings.find(
      (s) => s.url !== page.url && s.title?.trim().toLowerCase() === title,
    );
    return dup
      ? { passed: false, description: 'Alt URL folosește exact același title.', detectedValue: dup.url }
      : { passed: true };
  },
};

export const cannibalizationRule: Rule = {
  id: 'content.cannibalization',
  version: 1,
  category: 'content',
  severity: 'info',
  fixTitle: 'Consolidează paginile care vizează același subiect',
  impactHint: 3,
  effortHint: 4,
  penalty: 15,
  check(page, ctx) {
    const h1 = page.h1?.trim().toLowerCase();
    if (!h1) return { passed: true };
    const dup = ctx.siblings.find((s) => s.url !== page.url && s.h1?.trim().toLowerCase() === h1);
    return dup
      ? { passed: false, description: 'Altă pagină are același H1 (posibilă canibalizare).', detectedValue: dup.url }
      : { passed: true };
  },
};

export const contentRules: Rule[] = [thinContentRule, duplicateTitleRule, cannibalizationRule];
