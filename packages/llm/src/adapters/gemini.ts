import type { LlmAdapter, Explanation, StructuredIssue } from '../types.js';
import { SYSTEM_PROMPT, buildUserPrompt, parseExplanationJson } from '../prompt.js';

/**
 * Google Gemini adapter (generativelanguage.googleapis.com). Free tier, no card
 * required. Same strict contract as the other adapters: structured input only,
 * temperature 0, JSON response.
 */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';

export const geminiAdapter: LlmAdapter = {
  provider: 'gemini',
  async explain(issue: StructuredIssue): Promise<Explanation> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(issue) }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 800 },
      }),
    });
    if (!res.ok) throw new Error(`gemini responded ${res.status}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const parsed = parseExplanationJson(text);
    return { provider: 'gemini', text: parsed.text, steps: parsed.steps };
  },
};
