import type { Rule } from '../rule.js';
import { onpageRules } from './onpage.js';

/**
 * The full rule catalog. Epic 4 fills in technical / cwv / content / geo rule modules
 * alongside `onpage.ts`. Keep every rule pure and unit-tested on HTML fixtures.
 */
export const ALL_RULES: Rule[] = [...onpageRules];

export { onpageRules };
