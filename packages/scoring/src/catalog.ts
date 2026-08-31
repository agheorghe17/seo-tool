import { ALL_RULES } from './rules/index.js';
import type { Rule } from './rule.js';

/**
 * Epic 5.1 — the issue → fix catalog. Deterministic (NOT LLM-generated) so it is testable
 * and predictable. The LLM only rewrites `steps` into prose; if it fails the guardrail we
 * fall back to exactly these strings.
 */
export interface CatalogEntry {
  ruleId: string;
  fixTitle: string;
  steps: string[];
  impactHint: number;
  effortHint: number;
  /** Epic 5.5 — safe to apply automatically on a connected WordPress site. */
  autoFixable: boolean;
}

/** Rules whose fix is a single safe field write (Epic 5.5 / Epic 6.4). */
export const AUTO_FIXABLE_RULES = new Set<string>([
  'onpage.title-length',
  'onpage.meta-description',
  'onpage.image-alt',
  'geo.schema-present',
  'geo.answerable-schema',
]);

/** Extra remediation steps per rule, keyed by rule id. Falls back to `[rule.fixTitle]`. */
const STEPS: Record<string, string[]> = {
  'technical.status-ok': [
    'Identifică de ce pagina nu răspunde cu 200 (server, routing, permisiuni).',
    'Dacă pagina a fost mutată, pune un redirect 301 către noul URL și scoate linkurile interne vechi.',
    'Dacă nu mai există, întoarce 410 și elimin-o din sitemap.',
  ],
  'technical.https': [
    'Instalează un certificat TLS (Let’s Encrypt e gratuit).',
    'Forțează redirect 301 de la http:// la https:// la nivel de server.',
    'Actualizează linkurile interne și canonical-urile ca să folosească https://.',
  ],
  'technical.redirect-chain': [
    'Trasează lanțul de redirect-uri (curl -IL URL).',
    'Înlocuiește-l cu un singur redirect 301 direct la destinația finală.',
    'Actualizează linkurile interne ca să pointeze direct la URL-ul final.',
  ],
  'technical.indexable': [
    'Verifică dacă `noindex` este intenționat pentru această pagină.',
    'Dacă pagina trebuie indexată, scoate meta robots `noindex` și header-ul `X-Robots-Tag`.',
  ],
  'technical.canonical': [
    'Setează `<link rel="canonical">` la URL-ul canonic real al paginii.',
    'Asigură-te că este un URL absolut și că pointează la o pagină care răspunde cu 200.',
  ],
  'technical.duplicate-content': [
    'Alege versiunea canonică a conținutului.',
    'Pune canonical de la duplicate către versiunea canonică, sau consolidează paginile.',
  ],
  'cwv.lcp': [
    'Identifică elementul LCP (imagine hero, bloc de text).',
    'Preîncarcă imaginea LCP, servește-o în format modern (AVIF/WebP) și dimensionată corect.',
    'Elimină resursele care blochează randarea din `<head>`.',
  ],
  'cwv.inp': [
    'Rupe task-urile JS lungi (> 50ms) în bucăți mai mici.',
    'Amână scripturile ne-critice și third-party.',
  ],
  'cwv.cls': [
    'Rezervă dimensiuni explicite pentru imagini, iframe-uri și reclame.',
    'Evită inserarea de conținut deasupra celui existent după încărcare.',
  ],
  'cwv.mobile-friendly': [
    'Adaugă `<meta name="viewport" content="width=device-width, initial-scale=1">`.',
    'Folosește layout responsive; evită lățimi fixe mai mari decât ecranul.',
  ],
  'onpage.title-length': [
    'Rescrie `<title>` în 30-60 de caractere, cu cuvântul-cheie principal la început.',
    'Fă-l unic față de celelalte pagini.',
  ],
  'onpage.meta-description': [
    'Scrie o meta description de 120-160 de caractere care rezumă pagina și invită la click.',
    'Fă-o unică per pagină.',
  ],
  'onpage.single-h1': [
    'Păstrează un singur `<h1>` care descrie subiectul paginii.',
    'Transformă celelalte titluri de nivel 1 în `<h2>`/`<h3>`.',
  ],
  'onpage.image-alt': [
    'Adaugă `alt` descriptiv la imaginile informative.',
    'Lasă `alt=""` doar pentru imaginile pur decorative.',
  ],
  'onpage.heading-hierarchy': [
    'Nu sări peste niveluri de heading (după H2 urmează H3, nu H4).',
    'Folosește ierarhia ca structură logică, nu pentru stilizare.',
  ],
  'content.thin': [
    'Extinde conținutul ca să acopere complet intenția căutării (întrebări conexe, exemple, pași).',
    'Adaugă valoare originală, nu text de umplutură.',
  ],
  'content.duplicate-title': [
    'Diferențiază title-urile paginilor care se suprapun.',
    'Dacă paginile sunt aproape identice, consolidează-le într-una singură.',
  ],
  'content.cannibalization': [
    'Decide care pagină ar trebui să ranking-ueze pentru subiect.',
    'Consolidează sau diferențiază clar celelalte pagini; pune redirect/canonical unde e cazul.',
  ],
  'geo.schema-present': [
    'Adaugă JSON-LD relevant tipului paginii (Article, Product, FAQPage, HowTo).',
    'Validează cu Rich Results Test.',
  ],
  'geo.answerable-schema': [
    'Marchează întrebările frecvente cu `FAQPage` sau pașii cu `HowTo`.',
    'Include un rezumat clar la începutul secțiunilor, ca fragment extractibil.',
  ],
  'geo.scannable': [
    'Împarte conținutul lung în secțiuni cu subtitluri H2/H3 descriptive.',
    'Pune un răspuns direct în primele 1-2 propoziții ale fiecărei secțiuni.',
  ],
  'technical.needs-ssr': [
    'Servește conținutul principal în HTML-ul inițial (SSR sau prerender).',
    'Verifică ce vede Googlebot cu testul de randare din Search Console.',
  ],
  'site.https': ['Activează HTTPS pe tot domeniul și forțează redirect de la http.'],
  'site.sitemap': ['Generează `sitemap.xml`, referă-l în `robots.txt` și trimite-l în Search Console.'],
  'site.robots': ['Adaugă un `robots.txt` valid care nu blochează resurse importante.'],
};

const RULE_BY_ID = new Map<string, Rule>(ALL_RULES.map((r) => [r.id, r]));

export function getCatalogEntry(
  ruleId: string,
  hints?: { impactHint?: number; effortHint?: number; fixTitle?: string },
): CatalogEntry {
  const rule = RULE_BY_ID.get(ruleId);
  const fixTitle = hints?.fixTitle ?? rule?.fixTitle ?? ruleId;
  return {
    ruleId,
    fixTitle,
    steps: STEPS[ruleId] ?? [fixTitle],
    impactHint: hints?.impactHint ?? rule?.impactHint ?? 3,
    effortHint: hints?.effortHint ?? rule?.effortHint ?? 3,
    autoFixable: AUTO_FIXABLE_RULES.has(ruleId),
  };
}

export const FIX_CATALOG: Record<string, CatalogEntry> = Object.fromEntries(
  [...RULE_BY_ID.keys(), 'technical.needs-ssr', 'site.https', 'site.sitemap', 'site.robots'].map(
    (id) => [id, getCatalogEntry(id)],
  ),
);
