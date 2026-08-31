import { describe, expect, it } from 'vitest';
import { explanationIsGrounded } from './guardrail.js';
import type { StructuredIssue } from './types.js';

const issue: StructuredIssue = {
  ruleId: 'onpage.title-length',
  ruleVersion: 1,
  category: 'onpage',
  severity: 'warning',
  description: 'Title-ul are 74 caractere (recomandat 30-60).',
  detectedValue: '74',
  fixTitle: 'Ajustează lungimea title-ului la 30-60 de caractere',
  catalogSteps: ['Rescrie <title> în 30-60 de caractere.'],
  pageUrl: 'https://example.com/widgets',
};

describe('explanationIsGrounded', () => {
  it('accepts an explanation that only uses input numbers', () => {
    expect(
      explanationIsGrounded(issue, {
        provider: 'anthropic',
        text: 'Title-ul depășește pragul recomandat de 60 de caractere; ai 74.',
        steps: ['Scurtează la maxim 60 de caractere.'],
      }),
    ).toBe(true);
  });

  it('rejects an explanation that invents a statistic', () => {
    expect(
      explanationIsGrounded(issue, {
        provider: 'anthropic',
        text: 'Title-urile scurte cresc CTR-ul cu 35% conform studiilor.',
        steps: ['Rescrie title-ul.'],
      }),
    ).toBe(false);
  });

  it('rejects an explanation that links to an unrelated URL', () => {
    expect(
      explanationIsGrounded(issue, {
        provider: 'anthropic',
        text: 'Vezi ghidul de pe https://seo-guru.example/tips pentru detalii.',
        steps: ['Aplică recomandarea.'],
      }),
    ).toBe(false);
  });
});
