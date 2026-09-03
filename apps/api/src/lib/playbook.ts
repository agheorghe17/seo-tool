import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db, playbookRules } from 'db';
import { guardedCompleteJson } from './llm.js';

const DISTILL_SYSTEM = [
  'Esti un editor de playbook SEO. Primesti o corectare facuta de utilizator asupra unei recomandari automate.',
  'Transform-o intr-o REGULA scurta, generala si niche-agnostica pentru playbook (o singura propozitie, imperativ).',
  'NU include nume de firma, oras sau industrie specifice — fa regula sa se aplice oricarui site.',
  'Fara promisiuni de pozitie/trafic. Raspunde DOAR cu JSON: {"rule": "..."}.',
].join('\n');

/** Distil a raw correction into a crisp rule (LLM if available, else the user's words). */
export async function distilRule(context: string, correction: string): Promise<string> {
  const out = await guardedCompleteJson<{ rule?: string }>(
    DISTILL_SYSTEM,
    `Context: ${context}\nCorectare: ${correction}`,
    { maxTokens: 200 },
  );
  const rule = out?.rule?.trim();
  if (rule && rule.length >= 8 && rule.length <= 240) return rule;
  return correction.trim().replace(/\s+/g, ' ').slice(0, 200);
}

/** Distil + persist a learned rule (site-scoped). Best-effort — never throws to the caller. */
export async function learnFromCorrection(
  siteId: string,
  context: string,
  correction: string,
  sourceRef?: string,
): Promise<void> {
  try {
    const rule = await distilRule(context, correction);
    await db.insert(playbookRules).values({
      siteId,
      rule,
      rationale: `${context}${context ? ' — ' : ''}${correction}`.slice(0, 600),
      source: 'correction',
      sourceRef: sourceRef ?? null,
    });
  } catch {
    /* learning is best-effort */
  }
}

/** Read the human-curated base playbook from the repo (best-effort). */
export async function readBasePlaybook(): Promise<string> {
  for (const base of [process.cwd(), join(process.cwd(), '..', '..'), '/app']) {
    try {
      const txt = await readFile(join(base, 'seo-playbook.md'), 'utf8');
      if (txt.trim()) return txt;
    } catch {
      /* try next */
    }
  }
  return '# SEO Playbook\n\n(base file not found)';
}

/** Merge the base file with the learned rules into one markdown document. */
export function mergePlaybook(
  base: string,
  rules: { rule: string; siteId: string | null }[],
): string {
  if (rules.length === 0) return base;
  const lines = rules.map((r) => `- ${r.rule}${r.siteId ? '' : '  _(toate site-urile)_'}`);
  return `${base.trimEnd()}\n\n## Reguli învățate (din corectările tale)\n\n${lines.join('\n')}\n`;
}
