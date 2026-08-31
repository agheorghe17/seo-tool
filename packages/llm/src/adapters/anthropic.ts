import type { LlmAdapter, Explanation, StructuredIssue } from '../types.js';
import { SYSTEM_PROMPT, buildUserPrompt, parseExplanationJson } from '../prompt.js';

/**
 * Epic 5.3.1 — Claude adapter. Structured input only, temperature 0, hard token cap.
 * `@anthropic-ai/sdk` is imported lazily so the package has no hard dependency when
 * `LLM_PROVIDER != anthropic`.
 */
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS ?? 600);

export const anthropicAdapter: LlmAdapter = {
  provider: 'anthropic',
  async explain(issue: StructuredIssue): Promise<Explanation> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const res = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(issue) }],
    });

    const text = res.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    const parsed = parseExplanationJson(text);
    return { provider: 'anthropic', text: parsed.text, steps: parsed.steps };
  },
};
