import { normalize } from './text.js';

/**
 * Phase 4 — verify a pasted blog article against best practices before it goes live.
 * PURE. Heuristics only — an optional LLM grade is added by the caller.
 */

export interface ArticleCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface ArticleVerdict {
  checks: ArticleCheck[];
  score: number;
  pass: boolean;
  ranAt: string;
}

export interface ArticleSpec {
  keyword: string;
  secondaryKeywords?: string[];
  linkTo?: string | null;
  anchor?: string | null;
  targetWords?: number | null;
  /** Best competitor main text, for a near-duplication check. */
  competitorText?: string | null;
}

const PROMISE_RE = /(garant|vei ajunge|locul 1|pozi[țt]ia 1|#1\b|100% |trafic garantat)/i;
const AI_BOILERPLATE = [
  'in peisajul digital',
  'în peisajul digital',
  'in era digitala',
  'în era digitală',
  'este important sa retinem',
  'este important să reținem',
  'in concluzie, este clar',
  'în lumea de astazi',
  'în lumea de astăzi',
  'fie ca esti',
  'fără îndoială că',
];

function wordCount(s: string): number {
  return (s.match(/\p{L}[\p{L}\p{M}'-]*/gu) ?? []).length;
}
function countOccurrences(haystack: string, needle: string): number {
  const n = normalize(needle);
  if (!n) return 0;
  return (normalize(haystack).match(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) ?? [])
    .length;
}
function shingleOverlap(a: string, b: string, k = 6): number {
  const wa = normalize(a).split(/\s+/).filter(Boolean);
  const wb = normalize(b).split(/\s+/).filter(Boolean);
  if (wa.length < k || wb.length < k) return 0;
  const setB = new Set<string>();
  for (let i = 0; i + k <= wb.length; i++) setB.add(wb.slice(i, i + k).join(' '));
  let hit = 0;
  let total = 0;
  for (let i = 0; i + k <= wa.length; i++) {
    total++;
    if (setB.has(wa.slice(i, i + k).join(' '))) hit++;
  }
  return total ? hit / total : 0;
}

export function checkArticle(md: string, spec: ArticleSpec): ArticleVerdict {
  const checks: ArticleCheck[] = [];
  const add = (id: string, label: string, status: ArticleCheck['status'], detail: string) =>
    checks.push({ id, label, status, detail });

  const lines = md.split('\n');
  const h1s = lines.filter((l) => /^#\s+\S/.test(l));
  const h2s = lines.filter((l) => /^##\s+\S/.test(l));
  const body = md.replace(/^#.*$/gm, ' ');
  const words = wordCount(body);
  const kw = spec.keyword;
  const firstPara = md.split(/\n\s*\n/).find((p) => !p.trim().startsWith('#') && p.trim().length > 40) ?? '';

  // --- keyword ---
  add(
    'kw_h1',
    'Cuvântul cheie în titlu (H1)',
    h1s.some((l) => normalize(l).includes(normalize(kw))) ? 'pass' : 'fail',
    h1s[0] ?? 'niciun H1',
  );
  add(
    'kw_intro',
    'Cuvântul cheie în primul paragraf',
    normalize(firstPara).includes(normalize(kw)) ? 'pass' : 'warn',
    firstPara.slice(0, 90) + '…',
  );
  add(
    'kw_h2',
    'Cuvântul cheie într-un H2',
    h2s.some((l) => normalize(l).includes(normalize(kw))) ? 'pass' : 'warn',
    `${h2s.length} H2`,
  );
  const kwCount = countOccurrences(body, kw);
  const density = words ? kwCount / words : 0;
  add(
    'kw_density',
    'Densitatea cuvântului cheie',
    density === 0 ? 'fail' : density > 0.028 ? 'warn' : 'pass',
    `${kwCount}× în ${words} cuvinte (${(density * 100).toFixed(1)}%)`,
  );
  const missingSecondary = (spec.secondaryKeywords ?? []).filter((s) => countOccurrences(body, s) === 0);
  if ((spec.secondaryKeywords ?? []).length)
    add(
      'kw_secondary',
      'Cuvinte cheie secundare acoperite',
      missingSecondary.length === 0 ? 'pass' : missingSecondary.length > 1 ? 'warn' : 'pass',
      missingSecondary.length ? `lipsesc: ${missingSecondary.join(', ')}` : 'toate prezente',
    );

  // --- internal linking ---
  const mdLinks = [...md.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => ({ text: m[1]!, href: m[2]! }));
  const internal = mdLinks.filter((l) => !/^https?:\/\//i.test(l.href) || (spec.linkTo && l.href.includes(new URL(spec.linkTo).host)) || l.href.startsWith('/'));
  if (spec.linkTo) {
    const wantPath = (() => {
      try {
        return new URL(spec.linkTo).pathname.replace(/\/+$/, '');
      } catch {
        return spec.linkTo.replace(/\/+$/, '');
      }
    })();
    const hit = mdLinks.some((l) => l.href.replace(/\/+$/, '').endsWith(wantPath) && wantPath.length > 1);
    add(
      'link_pillar',
      'Link intern către pagina-bani',
      hit ? 'pass' : 'fail',
      hit ? `→ ${wantPath}` : `lipsește linkul spre ${wantPath}`,
    );
  }
  add(
    'link_count',
    'Număr de linkuri interne',
    internal.length >= 2 && internal.length <= 8 ? 'pass' : internal.length < 2 ? 'warn' : 'warn',
    `${internal.length} linkuri interne`,
  );
  const badAnchors = internal.filter((l) => /^(aici|click aici|citește|vezi|link)$/i.test(l.text.trim()));
  add(
    'anchor_quality',
    'Ancore descriptive',
    badAnchors.length === 0 ? 'pass' : 'warn',
    badAnchors.length ? `generice: ${badAnchors.map((a) => a.text).join(', ')}` : 'ok',
  );

  // --- structure ---
  add('one_h1', 'Un singur H1', h1s.length === 1 ? 'pass' : 'fail', `${h1s.length} H1`);
  add('h2_count', 'Cel puțin 3 secțiuni H2', h2s.length >= 3 ? 'pass' : 'warn', `${h2s.length} H2`);
  const top = normalize(md.slice(0, 600));
  add(
    'tldr',
    'Rezumat „Pe scurt" la început',
    /pe scurt|rezumat|pe scurt:|concluzii cheie|ce trebuie sa stii/.test(top) ? 'pass' : 'warn',
    'primele ~600 caractere',
  );
  add(
    'faq',
    'Secțiune „Întrebări frecvente"',
    /intrebari frecvente|faq/.test(normalize(md)) ? 'pass' : 'warn',
    '',
  );
  const tw = spec.targetWords ?? 1000;
  const lenOk = words >= tw * 0.7 && words <= tw * 1.4;
  add(
    'length',
    'Lungime potrivită',
    lenOk ? 'pass' : words < tw * 0.5 ? 'fail' : 'warn',
    `${words} cuvinte (țintă ~${tw})`,
  );

  // --- quality ---
  add('no_promises', 'Fără promisiuni de poziție/trafic', PROMISE_RE.test(md) ? 'fail' : 'pass', '');
  const stats = [...md.matchAll(/\d+([.,]\d+)?\s?%/g)].length;
  const cited = /surs[ăa]|studiu|conform|potrivit|\[[^\]]+\]\(https?:/i.test(md);
  add(
    'no_fabricated_stats',
    'Statistici cu sursă',
    stats === 0 ? 'pass' : cited ? 'pass' : 'warn',
    stats ? `${stats} procente în text${cited ? '' : ' fără sursă vizibilă'}` : 'niciunul',
  );
  const boiler = AI_BOILERPLATE.filter((p) => normalize(md).includes(p));
  add(
    'no_boilerplate',
    'Fără clișee AI',
    boiler.length === 0 ? 'pass' : 'warn',
    boiler.length ? boiler.join('; ') : 'ok',
  );
  const paras = md.split(/\n\s*\n/).filter((p) => p.trim() && !p.trim().startsWith('#'));
  const avgPara = paras.length ? paras.reduce((s, p) => s + wordCount(p), 0) / paras.length : 0;
  add(
    'readability',
    'Paragrafe scanabile',
    avgPara <= 100 ? 'pass' : 'warn',
    `~${Math.round(avgPara)} cuvinte/paragraf`,
  );
  if (spec.competitorText && spec.competitorText.length > 400) {
    const ov = shingleOverlap(body, spec.competitorText);
    add(
      'originality',
      'Original (nu copiază competitorul)',
      ov < 0.06 ? 'pass' : ov < 0.15 ? 'warn' : 'fail',
      `${(ov * 100).toFixed(1)}% suprapunere de fraze`,
    );
  }

  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  const score = Math.max(0, Math.round(100 - fails * 25 - warns * 6));
  return { checks, score, pass: fails === 0 && warns <= 2, ranAt: new Date().toISOString() };
}
