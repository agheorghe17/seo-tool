import { describe, expect, it, vi } from 'vitest';
import { expandSeeds, suggest } from './autocomplete.js';

const fakeFetch = (map: Record<string, string[]>) =>
  vi.fn(async (url: string | URL) => {
    const q = new URL(String(url)).searchParams.get('q') ?? '';
    return new Response(JSON.stringify([q, map[q] ?? []]), { status: 200 });
  }) as unknown as typeof fetch;

describe('suggest', () => {
  it('returns the suggestion array', async () => {
    const fetchImpl = fakeFetch({ 'google ads': ['google ads pret', 'google ads agentie'] });
    expect(await suggest('google ads', { fetchImpl })).toEqual([
      'google ads pret',
      'google ads agentie',
    ]);
  });

  it('returns [] on a non-200', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    expect(await suggest('x', { fetchImpl })).toEqual([]);
  });
});

describe('expandSeeds', () => {
  it('de-dupes and lower-cases across seeds', async () => {
    const fetchImpl = fakeFetch({
      'google ads': ['Google Ads Pret', 'campanii google ads'],
      'facebook ads': ['facebook ads pret', 'campanii google ads'],
    });
    const out = await expandSeeds(['google ads', 'facebook ads'], { fetchImpl });
    expect(out).toEqual(
      expect.arrayContaining(['google ads pret', 'campanii google ads', 'facebook ads pret']),
    );
    expect(new Set(out).size).toBe(out.length);
  });
});
