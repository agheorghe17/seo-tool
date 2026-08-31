import type { LlmAdapter, Explanation, StructuredIssue } from '../types.js';
import { SYSTEM_PROMPT, buildUserPrompt, parseExplanationJson } from '../prompt.js';

/**
 * Epic 5.3.2 — local model via the Ollama HTTP API (`OLLAMA_BASE_URL`). Zero cost.
 * Same strict contract as the anthropic adapter.
 */
const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.1:8b';

export const ollamaAdapter: LlmAdapter = {
  provider: 'ollama',
  async explain(issue: StructuredIssue): Promise<Explanation> {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(issue) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ollama responded ${res.status}`);
    const json = (await res.json()) as { message?: { content?: string } };
    const parsed = parseExplanationJson(json.message?.content ?? '');
    return { provider: 'ollama', text: parsed.text, steps: parsed.steps };
  },
};
