import type { Rule } from '../rule.js';
import { onpageRules } from './onpage.js';
import { technicalRules } from './technical.js';
import { cwvRules } from './cwv.js';
import { contentRules } from './content.js';
import { geoRules } from './geo.js';

/**
 * The full rule catalog. Every rule is pure and unit-tested on HTML/PageData fixtures.
 * Add new rules to the relevant module, not here.
 */
export const ALL_RULES: Rule[] = [
  ...technicalRules,
  ...cwvRules,
  ...onpageRules,
  ...contentRules,
  ...geoRules,
];

export { onpageRules, technicalRules, cwvRules, contentRules, geoRules };
