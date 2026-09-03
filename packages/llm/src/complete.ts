import type { LlmProvider } from 'shared';
import { parseExplanationJson } from './prompt.js';

function resolveProvider(): LlmProvider {
  const v = process.env.LLM_PROVIDER;
  return v === 'anthropic' || v === 'ollama' || v === 'gemini' ? v : 'none';
}

/**
 * General-purpose structured completion for the strategy module (Epics 13-19).
 * Same provider selection + graceful degrade as `explainIssue`: if `LLM_PROVIDER=none`
 * or the call fails, returns `null` and the caller uses a deterministic fallback.
 *
 * `system` must forbid invented facts + position/traffic promises. Output MUST be JSON
 * when `opts.json` is set.
 */
export interface CompleteOptions {
  provider?: LlmProvider;
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for a strict JSON response (Gemini/Ollama honour this natively). */
  json?: boolean;
}

async function geminiComplete(
  system: string,
  user: string,
  opts: CompleteOptions,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0,
    maxOutputTokens: opts.maxTokens ?? 2048,
  };
  if (opts.json) generationConfig.responseMimeType = 'application/json';
  // These are thinking models; cap the thinking budget for cost/latency on batch work.
  const think = process.env.GEMINI_THINKING_BUDGET;
  if (think != null && think !== '') {
    generationConfig.thinkingConfig = { thinkingBudget: Number(think) };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.GEMINI_TIMEOUT_MS ?? 30_000));
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function completeText(
  system: string,
  user: string,
  opts: CompleteOptions = {},
): Promise<string | null> {
  const provider = opts.provider ?? resolveProvider();
  if (provider === 'none') return null;

  try {
    if (provider === 'gemini') {
      return await geminiComplete(system, user, opts);
    }

    if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return null;
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: opts.maxTokens ?? 1500,
        temperature: opts.temperature ?? 0,
        system,
        messages: [{ role: 'user', content: user }],
      });
      return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('') || null;
    }

    // ollama
    const base = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? 'llama3.1:8b',
        stream: false,
        format: 'json',
        options: { temperature: opts.temperature ?? 0 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? null;
  } catch {
    return null;
  }
}

/** Complete + parse the first JSON object/array in the response. `null` on any failure. */
export async function completeJson<T>(
  system: string,
  user: string,
  opts: CompleteOptions = {},
): Promise<T | null> {
  const raw = await completeText(system, user, { ...opts, json: true });
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export { parseExplanationJson };
