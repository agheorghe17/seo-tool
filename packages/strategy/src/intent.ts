import type { KeywordIntent } from './types.js';
import { normalize } from './text.js';

/**
 * Epic 14.1 — heuristic search-intent classification for Romanian + English keywords.
 * Diacritics are folded first (preț/pret, agenție/agentie) so the rules stay simple.
 * Ambiguous ones return 'unknown' so the caller can send just those to an LLM.
 */
const RULES: { intent: KeywordIntent; re: RegExp }[] = [
  {
    intent: 'transactional',
    re: /\b(cumpar|comanda|pret|preturi|tarif|cost|oferta|oferte|reducere|abonament|plata|buy|price|cheap|deal|order|coupon|quote)\b/,
  },
  {
    intent: 'local',
    re: /\b(langa mine|near me|bucuresti|cluj|timisoara|iasi|constanta|brasov|sibiu|oradea|ploiesti|craiova|local|in zona)\b/,
  },
  {
    intent: 'commercial',
    re: /\b(cel mai bun|cea mai buna|cele mai bune|cei mai buni|top \d|best|review|recenzi[ei]|recenzii|comparatie|vs|alternativa|servicii|agenti[ei]|agentii|firma|companie|freelancer|specialist|consultanta|externalizare|ppc|seo|sem|marketing)\b/,
  },
  {
    intent: 'informational',
    re: /\b(cum|ce este|ce inseamna|de ce|ghid|tutorial|exemple|idei|sfaturi|invata|what is|how to|guide|tips|ideas|meaning)\b/,
  },
  {
    intent: 'navigational',
    re: /\b(login|autentificare|contul meu|dashboard|aplicatie|download|descarcare)\b/,
  },
];

export function classifyIntent(keyword: string): KeywordIntent {
  const k = normalize(keyword);
  for (const { intent, re } of RULES) {
    if (re.test(k)) return intent;
  }
  // A bare service noun ("google ads", "creare site") reads as commercial.
  if (k.split(' ').length <= 4 && k.length >= 3) {
    return 'commercial';
  }
  return 'unknown';
}

export function classifyMany(keywords: string[]): Record<string, KeywordIntent> {
  const out: Record<string, KeywordIntent> = {};
  for (const kw of keywords) out[kw] = classifyIntent(kw);
  return out;
}
