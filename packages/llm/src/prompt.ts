import type { StructuredIssue } from './types.js';

/** Strict system prompt shared by the anthropic + ollama adapters (Epic 5.3). */
export const SYSTEM_PROMPT = [
  'Ești un asistent SEO. Primești DOAR date structurate despre o singură problemă tehnică detectată pe o pagină.',
  'Scrie o explicație scurtă în română (2-4 propoziții) și pași de remediere concreți.',
  'Reguli stricte:',
  '- Folosește exclusiv informația din datele primite. NU inventa cifre, procente, studii, nume sau URL-uri.',
  '- Nu promite creșteri de trafic sau poziții. Nu da garanții.',
  '- Poți reformula pașii din `catalogSteps`, dar nu adăuga pași care presupun informație pe care nu o ai.',
  'Răspunde NUMAI cu JSON valid, fără text în plus, în forma:',
  '{"text": "<explicația>", "steps": ["<pas 1>", "<pas 2>"]}',
].join('\n');

export function buildUserPrompt(issue: StructuredIssue): string {
  return JSON.stringify(
    {
      ruleId: issue.ruleId,
      category: issue.category,
      severity: issue.severity,
      description: issue.description,
      detectedValue: issue.detectedValue,
      fixTitle: issue.fixTitle,
      catalogSteps: issue.catalogSteps,
      pageUrl: issue.pageUrl,
    },
    null,
    2,
  );
}

export interface RawExplanation {
  text: string;
  steps: string[];
}

/** Parse a model response that should be `{text, steps}` JSON (tolerates code fences). */
export function parseExplanationJson(raw: string): RawExplanation {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in model response');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<RawExplanation>;
  if (typeof parsed.text !== 'string' || !Array.isArray(parsed.steps)) {
    throw new Error('model response missing text/steps');
  }
  return { text: parsed.text, steps: parsed.steps.map(String) };
}
