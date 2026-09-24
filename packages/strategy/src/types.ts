export type KeywordIntent =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'navigational'
  | 'local'
  | 'unknown';

export type KeywordBucket = 'quick_win' | 'build_content' | 'long_game' | 'tracked' | 'none';

/** Minimal keyword shape the pure strategy functions operate on. */
export interface KeywordInput {
  keyword: string;
  searchVolume?: number | null;
  competition?: number | null; // 0..1
  currentPosition?: number | null;
  businessRelevance?: number | null; // 0..100
  hasTargetPage?: boolean;
}

export interface BusinessProfileInput {
  summary?: string | null;
  services: string[];
  locations: string[];
  languages?: string[];
}

/** A page (yours or a competitor's) reduced to what gap analysis needs. */
export interface PageLike {
  url: string;
  title: string | null;
  h1: string | null;
  headings: { level: number; text: string }[];
  wordCount: number;
  schemaTypes: string[];
  slug?: string | null;
  /** Body copy (Epic 23 crawler capture). When present, target-keyword fit reads it
   * too — not just title/H1/slug. */
  mainText?: string | null;
}
