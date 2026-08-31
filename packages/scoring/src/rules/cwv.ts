import type { Rule } from '../rule.js';

/** Epic 4.3 — Core Web Vitals / UX rules (default category weight 15%). Null metric = not judged. */

export const lcpRule: Rule = {
  id: 'cwv.lcp',
  version: 1,
  category: 'cwv',
  severity: 'warning',
  fixTitle: 'Îmbunătățește Largest Contentful Paint sub 2.5s',
  impactHint: 4,
  effortHint: 4,
  penalty: 35,
  check(page) {
    if (page.lcpMs == null) return { passed: true };
    if (page.lcpMs <= 2500) return { passed: true };
    return {
      passed: false,
      description: `LCP este ${(page.lcpMs / 1000).toFixed(1)}s (țintă < 2.5s).`,
      detectedValue: String(Math.round(page.lcpMs)),
    };
  },
};

export const inpRule: Rule = {
  id: 'cwv.inp',
  version: 1,
  category: 'cwv',
  severity: 'warning',
  fixTitle: 'Reduce Interaction to Next Paint sub 200ms',
  impactHint: 3,
  effortHint: 4,
  penalty: 30,
  check(page) {
    if (page.inpMs == null) return { passed: true };
    if (page.inpMs <= 200) return { passed: true };
    return {
      passed: false,
      description: `INP este ${Math.round(page.inpMs)}ms (țintă < 200ms).`,
      detectedValue: String(Math.round(page.inpMs)),
    };
  },
};

export const clsRule: Rule = {
  id: 'cwv.cls',
  version: 1,
  category: 'cwv',
  severity: 'warning',
  fixTitle: 'Reduce Cumulative Layout Shift sub 0.1',
  impactHint: 3,
  effortHint: 3,
  penalty: 25,
  check(page) {
    if (page.clsScore == null) return { passed: true };
    if (page.clsScore <= 0.1) return { passed: true };
    return {
      passed: false,
      description: `CLS este ${page.clsScore.toFixed(2)} (țintă < 0.1).`,
      detectedValue: page.clsScore.toFixed(3),
    };
  },
};

export const mobileFriendlyRule: Rule = {
  id: 'cwv.mobile-friendly',
  version: 1,
  category: 'cwv',
  severity: 'critical',
  fixTitle: 'Adaugă un viewport meta și un layout responsive',
  impactHint: 5,
  effortHint: 3,
  penalty: 40,
  check(page) {
    if (page.mobileFriendly !== false) return { passed: true };
    return { passed: false, description: 'Pagina nu pare optimizată pentru mobil.', detectedValue: null };
  },
};

export const cwvRules: Rule[] = [lcpRule, inpRule, clsRule, mobileFriendlyRule];
