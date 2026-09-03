import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeJson, completeText } from './complete.js';

const OLD_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.restoreAllMocks();
});

function mockGemini(body: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response);
}

describe('completeText — gemini', () => {
  it('returns null when the key is missing', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;
    expect(await completeText('sys', 'user')).toBeNull();
  });

  it('parses the candidate text', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'k';
    const spy = mockGemini({
      candidates: [{ content: { parts: [{ text: '{"seeds":["a","b"]}' }] } }],
    });
    const out = await completeJson<{ seeds: string[] }>('sys', 'user');
    expect(out?.seeds).toEqual(['a', 'b']);
    // system instruction + JSON mime were requested
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('returns null on a non-ok response (→ deterministic fallback)', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'k';
    mockGemini({}, false);
    expect(await completeText('sys', 'user')).toBeNull();
  });

  it('stays null for provider none', async () => {
    process.env.LLM_PROVIDER = 'none';
    expect(await completeText('sys', 'user')).toBeNull();
  });
});
