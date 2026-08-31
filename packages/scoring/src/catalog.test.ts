import { describe, expect, it } from 'vitest';
import { AUTO_FIXABLE_RULES, FIX_CATALOG, getCatalogEntry } from './catalog.js';
import { ALL_RULES } from './rules/index.js';

describe('fix catalog', () => {
  it('has an entry for every rule', () => {
    for (const rule of ALL_RULES) {
      expect(FIX_CATALOG[rule.id], rule.id).toBeDefined();
      expect(FIX_CATALOG[rule.id]!.steps.length).toBeGreaterThan(0);
    }
  });

  it('marks only the safe field-write rules as auto-fixable', () => {
    expect(getCatalogEntry('onpage.meta-description').autoFixable).toBe(true);
    expect(getCatalogEntry('onpage.image-alt').autoFixable).toBe(true);
    expect(getCatalogEntry('technical.https').autoFixable).toBe(false);
    expect(getCatalogEntry('content.thin').autoFixable).toBe(false);
    expect([...AUTO_FIXABLE_RULES].every((id) => FIX_CATALOG[id])).toBe(true);
  });

  it('carries impact/effort hints from the rule', () => {
    const entry = getCatalogEntry('technical.status-ok');
    expect(entry.impactHint).toBe(5);
    expect(entry.effortHint).toBe(3);
  });

  it('falls back to fixTitle for an unknown rule id', () => {
    const entry = getCatalogEntry('made.up', { fixTitle: 'Do the thing' });
    expect(entry.steps).toEqual(['Do the thing']);
    expect(entry.autoFixable).toBe(false);
  });
});
