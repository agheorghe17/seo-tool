import type { Rule } from '../rule.js';

/** Epic 4.4 — On-page rules. This is a starter set; expand per EPICS.md. */

export const titleLengthRule: Rule = {
  id: 'onpage.title-length',
  version: 1,
  category: 'onpage',
  severity: 'warning',
  fixTitle: 'Ajustează lungimea title-ului la 30-60 de caractere',
  impactHint: 4,
  effortHint: 1,
  penalty: 25,
  check(page) {
    const title = page.title?.trim() ?? '';
    if (title.length === 0) {
      return { passed: false, description: 'Pagina nu are <title>.', detectedValue: null };
    }
    if (title.length < 30 || title.length > 60) {
      return {
        passed: false,
        description: `Title-ul are ${title.length} caractere (recomandat 30-60).`,
        detectedValue: String(title.length),
      };
    }
    return { passed: true };
  },
};

export const metaDescriptionRule: Rule = {
  id: 'onpage.meta-description',
  version: 1,
  category: 'onpage',
  severity: 'warning',
  fixTitle: 'Scrie o meta description de 120-160 de caractere',
  impactHint: 3,
  effortHint: 1,
  penalty: 20,
  check(page) {
    const desc = page.metaDescription?.trim() ?? '';
    if (desc.length === 0) {
      return { passed: false, description: 'Lipsește meta description.', detectedValue: null };
    }
    if (desc.length < 120 || desc.length > 160) {
      return {
        passed: false,
        description: `Meta description are ${desc.length} caractere (recomandat 120-160).`,
        detectedValue: String(desc.length),
      };
    }
    return { passed: true };
  },
};

export const singleH1Rule: Rule = {
  id: 'onpage.single-h1',
  version: 1,
  category: 'onpage',
  severity: 'warning',
  fixTitle: 'Păstrează un singur H1 pe pagină',
  impactHint: 3,
  effortHint: 2,
  penalty: 15,
  check(page) {
    const h1s = page.headings.filter((h) => h.level === 1);
    if (h1s.length === 1) return { passed: true };
    return {
      passed: false,
      description:
        h1s.length === 0 ? 'Pagina nu are niciun H1.' : `Pagina are ${h1s.length} H1-uri.`,
      detectedValue: String(h1s.length),
    };
  },
};

export const imageAltRule: Rule = {
  id: 'onpage.image-alt',
  version: 1,
  category: 'onpage',
  severity: 'info',
  fixTitle: 'Adaugă text alternativ la imagini',
  impactHint: 2,
  effortHint: 2,
  penalty: 15,
  check(page) {
    const missing = page.images.filter((img) => !img.alt || img.alt.trim() === '');
    if (missing.length === 0) return { passed: true };
    return {
      passed: false,
      description: `${missing.length} din ${page.images.length} imagini nu au alt text.`,
      detectedValue: `${missing.length}/${page.images.length}`,
    };
  },
};

export const headingHierarchyRule: Rule = {
  id: 'onpage.heading-hierarchy',
  version: 1,
  category: 'onpage',
  severity: 'info',
  fixTitle: 'Nu sări peste niveluri de heading (ex: H2 → H4)',
  impactHint: 2,
  effortHint: 2,
  penalty: 10,
  check(page) {
    let prev = 0;
    for (const h of page.headings) {
      if (prev !== 0 && h.level > prev + 1) {
        return {
          passed: false,
          description: `Ierarhie de headings inconsistentă (H${prev} → H${h.level}).`,
          detectedValue: `H${prev}->H${h.level}`,
        };
      }
      prev = h.level;
    }
    return { passed: true };
  },
};

const LOCAL_SCHEMA = /^(LocalBusiness|Organization|Store|Restaurant|MedicalBusiness|ProfessionalService|Dentist|Attorney|HomeAndConstructionBusiness)$/;

function looksLikeContactPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase().replace(/\/+$/, '');
    return path === '' || /\/(contact|despre|about|echipa|team)$/.test(path);
  } catch {
    return false;
  }
}

/**
 * Epic 21 (local SEO) — the homepage / contact page should carry LocalBusiness or
 * Organization JSON-LD so search engines and map results have your name, address, phone.
 */
export const localBusinessSchemaRule: Rule = {
  id: 'onpage.localbusiness-schema',
  version: 1,
  category: 'geo',
  severity: 'info',
  fixTitle: 'Adaugă schema LocalBusiness / Organization cu nume, adresă și telefon',
  impactHint: 3,
  effortHint: 2,
  penalty: 18,
  check(page, ctx) {
    // National / online-only sites don't need address+phone schema — skip entirely.
    if (ctx.market?.localSeo === false) return { passed: true };
    if (!looksLikeContactPage(page.url)) return { passed: true };
    const has = page.schemaTypes.some((t) => LOCAL_SCHEMA.test(t));
    return has
      ? { passed: true }
      : {
          passed: false,
          description: 'Pagina de prezentare/contact nu are schema LocalBusiness sau Organization.',
          detectedValue: page.schemaTypes.join(', ') || null,
        };
  },
};

export const onpageRules: Rule[] = [
  titleLengthRule,
  metaDescriptionRule,
  singleH1Rule,
  imageAltRule,
  headingHierarchyRule,
  localBusinessSchemaRule,
];
