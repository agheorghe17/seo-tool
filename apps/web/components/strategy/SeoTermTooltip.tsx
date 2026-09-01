'use client';

import { useState, type ReactNode } from 'react';

/** Epic 18.1 — plain-Romanian glossary. Wrap any SEO term so a non-SEO user can hover it. */
const GLOSSARY: Record<string, string> = {
  keyword: 'Un cuvânt sau o expresie pe care oamenii o caută pe Google.',
  'cuvânt cheie': 'Un cuvânt sau o expresie pe care oamenii o caută pe Google.',
  poziție:
    'Locul pe care apare pagina ta în rezultatele Google pentru o căutare (1 = primul rezultat).',
  'poziție medie': 'Media pozițiilor tale pe toate cuvintele cheie pe care apari.',
  impresii: 'De câte ori a apărut pagina ta în rezultatele Google (chiar dacă nimeni n-a dat click).',
  ctr: 'Din câte au văzut rezultatul, ce procent au dat click.',
  'striking distance':
    'Cuvinte pe care ești pe pozițiile 5-20 (pagina 2 sau jos pe pagina 1) — un mic efort te poate duce pe prima pagină.',
  bucket: 'Categoria oportunității: câștig rapid, de creat conținut, sau termen lung.',
  intenție: 'Ce vrea de fapt cel care caută: să se informeze, să compare, sau să cumpere.',
  cluster: 'Un grup de cuvinte cheie pe același subiect (ex. toate variantele despre „Google Ads").',
  serp: 'Pagina de rezultate Google pentru o căutare.',
  volum: 'De câte ori pe lună se caută acel cuvânt în Google.',
  competiție: 'Cât de greu e să rankezi pe acel cuvânt (0 = ușor, 1 = foarte greu).',
  'content gap':
    'Subiecte pe care competitorii au pagini, iar tu nu — locuri unde poți crea conținut nou.',
  'vizibilitate':
    'Un scor care combină pozițiile tale — cu cât ești mai sus pe mai multe cuvinte, cu atât e mai mare.',
};

export function SeoTermTooltip({ term, children }: { term: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const def = GLOSSARY[term.toLowerCase()];
  if (!def) return <>{children ?? term}</>;
  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="cursor-help border-b border-dotted border-neutral-400 text-inherit"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children ?? term}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-xs font-normal text-[var(--text-muted)] shadow-lg">
          {def}
        </span>
      )}
    </span>
  );
}
