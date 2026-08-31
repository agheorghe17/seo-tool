import { describe, expect, it } from 'vitest';
import { prioritise, priorityScore } from './priority.js';

describe('priority', () => {
  it('ranks high-impact low-effort first', () => {
    const ranked = prioritise([
      { impact: 2, effort: 4 },
      { impact: 5, effort: 1 },
      { impact: 3, effort: 3 },
    ]);
    expect(ranked[0]).toMatchObject({ impact: 5, effort: 1, rank: 1 });
  });

  it('floats critical items above everything', () => {
    const ranked = prioritise([
      { impact: 5, effort: 1 },
      { impact: 1, effort: 5, critical: true },
    ]);
    expect(ranked[0]).toMatchObject({ critical: true, rank: 1 });
  });

  it('clamps out-of-range hints', () => {
    expect(priorityScore({ impact: 99, effort: 0 })).toBe(priorityScore({ impact: 5, effort: 1 }));
  });
});
