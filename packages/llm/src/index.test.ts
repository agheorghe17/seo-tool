import { describe, expect, it, vi } from 'vitest';
import { explainIssue, explanationCacheKey } from './index.js';
import type { LlmAdapter, LlmCache, StructuredIssue } from './types.js';

const issue: StructuredIssue = {
  ruleId: 'onpage.meta-description',
  ruleVersion: 1,
  category: 'onpage',
  severity: 'warning',
  description: 'Lipsește meta description.',
  detectedValue: null,
  fixTitle: 'Scrie o meta description de 120-160 de caractere',
  catalogSteps: ['Scrie o meta description de 120-160 de caractere.'],
  pageUrl: 'https://example.com/p',
};

class MemCache implements LlmCache {
  store = new Map<string, string>();
  async get(k: string) {
    return this.store.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.store.set(k, v);
  }
}

describe('explainIssue', () => {
  it('uses the catalog directly for provider "none"', async () => {
    const res = await explainIssue(issue);
    expect(res.provider).toBe('none');
    expect(res.steps).toEqual(issue.catalogSteps);
  });

  it('caches a grounded model response and reuses it', async () => {
    const adapter: LlmAdapter = {
      provider: 'anthropic',
      explain: vi.fn(async () => ({
        provider: 'anthropic' as const,
        text: 'Adaugă o descriere de 120-160 de caractere.',
        steps: ['Scrie textul.'],
      })),
    };
    const cache = new MemCache();

    const a = await explainIssue(issue, { adapter, cache });
    const b = await explainIssue(issue, { adapter, cache });

    expect(a.text).toContain('120-160');
    expect(b).toEqual(a);
    expect(adapter.explain).toHaveBeenCalledTimes(1);
    expect([...cache.store.keys()][0]).toBe(explanationCacheKey('anthropic', issue));
  });

  it('falls back to the catalog when the model hallucinates', async () => {
    const adapter: LlmAdapter = {
      provider: 'anthropic',
      explain: async () => ({
        provider: 'anthropic' as const,
        text: 'Meta descrierile bune cresc CTR-ul cu 28%.',
        steps: ['x'],
      }),
    };
    const res = await explainIssue(issue, { adapter });
    expect(res.provider).toBe('none');
    expect(res.steps).toEqual(issue.catalogSteps);
  });

  it('falls back to the catalog when the adapter throws', async () => {
    const adapter: LlmAdapter = {
      provider: 'ollama',
      explain: async () => {
        throw new Error('connection refused');
      },
    };
    const res = await explainIssue(issue, { adapter });
    expect(res.provider).toBe('none');
  });
});
