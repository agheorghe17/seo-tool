# SEO Playbook

Regulile pe care agentul SEO le aplică la fiecare revizuire. **Editează acest fișier
ca să-l „înveți".** Niche-agnostic — nimic specific unei industrii sau țări.

> **Reguli învățate automat:** de fiecare dată când corectezi o recomandare în
> aplicație („Nu e bine — corectează" pe o pagină, sau caseta din Setări → „Reguli
> învățate"), regula se salvează în baza de date și agentul o aplică imediat, în plus
> față de acest fișier. Vezi-le / editează-le în Setări; exportul complet:
> `GET /api/sites/:id/playbook/export` (îl poți lipi înapoi aici și comite în git).

## Principii

1. **Recomandările se bazează pe date, nu pe presupuneri.** Volum, poziție, relevanță,
   structura competitorilor — toate din datele furnizate. Fără cifre inventate.
2. **Niciodată promisiuni de poziție sau trafic.** Fără „vei ajunge pe locul 1",
   „garantat", „+X vizite sigur". Doar intervale cu ipoteze.
3. **Rankezi pe obiectul site-ului și pe serviciile oferite**, nu pe cuvinte cu volum
   mare dar irelevante.
4. Fără link building. Fără conținut generat automat publicat live (doar draft).

## Cuvântul țintă per pagină

- **Homepage → termen de CATEGORIE**, nu un serviciu anume. Ex.: pentru o agenție de
  marketing, „agenție marketing digital", nu „tiktok ads". Homepage-ul reprezintă tot
  business-ul.
- **Pagini de serviciu → cuvântul acelui serviciu** (ex. `/google-ads` → „servicii
  google ads"), cel mai relevant și cu intenție comercială.
- **Pagini legale / utilitare** (politică de confidențialitate, termeni, cookies,
  sitemap, coș, cont, arhive tag/autor) → **fără cuvânt țintă, fără blueprint.** Nu
  sunt menite să rankeze.
- Un cuvânt cu **relevanță < 30/100** față de servicii NU e o țintă validă.
- **Un singur cuvânt principal per pagină.** Dacă două pagini țintesc același cuvânt →
  canibalizare: alege una, reorientează cealaltă.
- Cuvinte de brand pur („nume firmă", „nume firmă d.o.o") nu sunt ținte — site-ul deja
  rankează #1 pe numele lui.

## Title / H1 / meta

- Title: 30–60 caractere, cuvântul țintă aproape de început, apoi brandul.
- Un singur H1, care conține cuvântul țintă.
- Meta description: 120–160 caractere, cuvântul țintă + un beneficiu concret + un CTA.
  Fără keyword stuffing.
- Nu propune un title/H1 care sună robotic sau repetă cuvântul de 3 ori.

## Structură & conținut

- H2-urile acoperă subtemele pe care le acoperă competitorii de top și tu nu.
- Word count țintă ≈ cel mai bun competitor pe acel cuvânt, plafonat rezonabil.
- Linkuri interne din/către pagini din același cluster tematic.

## Schema

- Homepage: `Organization`. Contact/despre cu SEO local activ: `LocalBusiness` (nume,
  adresă, telefon). Restul: `Article`.
- **SEO local (schema LocalBusiness, oraș în title, Google Business Profile) DOAR dacă
  site-ul a ales „Local — un oraș"** în Setări. O agenție/afacere online națională NU
  primește recomandări de SEO local.

## Ce semnalează agentul

- Homepage țintind un serviciu în loc de o categorie.
- Pagină legală/utilitară cu blueprint sau cuvânt țintă.
- Cuvânt țintă irelevant, typo, sau nume de firmă.
- Două pagini pe același cuvânt (canibalizare) nerezolvată.
- Recomandare de SEO local pe un site setat „național".
- Orice text care promite o poziție sau o cifră de trafic garantată.
