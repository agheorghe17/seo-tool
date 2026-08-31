/**
 * Epic 13.2 — Google Autocomplete (Suggest). Free, no API key. Gives keyword ideas
 * (no search volume). Used to expand seed keywords.
 */

export interface AutocompleteOptions {
  gl?: string;
  hl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const ENDPOINT = 'https://suggestqueries.google.com/complete/search';

/** Suggestions for one seed term. Returns [] on any error (best-effort). */
export async function suggest(seed: string, opts: AutocompleteOptions = {}): Promise<string[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    client: 'firefox', // returns clean JSON: ["seed", ["s1","s2",...]]
    q: seed,
    hl: opts.hl ?? 'ro',
    gl: opts.gl ?? 'ro',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8_000);
  try {
    const res = await doFetch(`${ENDPOINT}?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as [string, string[]];
    return Array.isArray(json?.[1]) ? json[1].map((s) => s.trim()).filter(Boolean) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Expand many seeds, including alphabet-suffix drilling ("seed a", "seed b", …) for depth.
 * De-duplicated, lower-cased, capped.
 */
export async function expandSeeds(
  seeds: string[],
  opts: AutocompleteOptions & { alphabet?: boolean; max?: number } = {},
): Promise<string[]> {
  const out = new Set<string>();
  const max = opts.max ?? 800;
  const queue: string[] = [...new Set(seeds.map((s) => s.trim().toLowerCase()).filter(Boolean))];

  for (const seed of queue) {
    if (out.size >= max) break;
    for (const s of await suggest(seed, opts)) out.add(s.toLowerCase());
    if (opts.alphabet) {
      for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
        if (out.size >= max) break;
        for (const s of await suggest(`${seed} ${letter}`, opts)) out.add(s.toLowerCase());
      }
    }
  }
  return [...out].slice(0, max);
}
