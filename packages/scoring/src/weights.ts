import { z } from 'zod';
import { DEFAULT_WEIGHTS, type CategoryWeights } from 'shared';

/** Epic 4.8 — category weights are configurable at runtime, not hardcoded. */
export const weightsSchema = z
  .object({
    technical: z.number().min(0).max(1),
    cwv: z.number().min(0).max(1),
    onpage: z.number().min(0).max(1),
    content: z.number().min(0).max(1),
    geo: z.number().min(0).max(1),
  })
  .partial();

/** Merge a partial/unknown config over the defaults; invalid input falls back to defaults. */
export function loadWeights(raw: unknown): CategoryWeights {
  const parsed = weightsSchema.safeParse(raw ?? {});
  if (!parsed.success) return { ...DEFAULT_WEIGHTS };
  return { ...DEFAULT_WEIGHTS, ...parsed.data };
}

export { DEFAULT_WEIGHTS };
export type { CategoryWeights };
