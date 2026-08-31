import type { Explanation, StructuredIssue } from './types.js';

/**
 * Anti-hallucination check (Epic 5.6). The generated explanation must not introduce
 * numbers or URLs that were not part of the structured input. If it does, the caller
 * falls back to the catalog template.
 */
export function explanationIsGrounded(issue: StructuredIssue, explanation: Explanation): boolean {
  const allowed = new Set<string>();
  const sources = [
    issue.detectedValue,
    issue.pageUrl,
    issue.fixTitle,
    issue.description,
    ...issue.catalogSteps,
  ];
  for (const val of sources) {
    if (!val) continue;
    for (const token of String(val).match(/\d+(?:[.,]\d+)?/g) ?? []) allowed.add(token);
  }

  const body = `${explanation.text}\n${explanation.steps.join('\n')}`;

  // No fabricated URLs.
  if (/\bhttps?:\/\/\S+/i.test(body)) {
    const urls = body.match(/\bhttps?:\/\/\S+/gi) ?? [];
    if (urls.some((u) => !issue.pageUrl || !u.startsWith(new URL(issue.pageUrl).origin))) {
      return false;
    }
  }

  // Every standalone number in the output must trace back to the input.
  const numbers = body.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [];
  for (const n of numbers) {
    if (!allowed.has(n)) return false;
  }

  if (explanation.text.trim().length === 0) return false;
  return true;
}
