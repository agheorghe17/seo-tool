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
4. Fără link building. Fără conținut generat automat publicat live (doar draft;
   utilizatorul verifică și publică din WordPress).
5. **Scris pentru cineva care nu știe SEO.** Limbaj simplu, în română, fără jargon
   neexplicat. Fiecare recomandare spune *ce* și *de ce*, concret.
6. **Explicația citește semnalele reale** — „~V căutări/lună, acum poziția ~P,
   relevanță R/100" — nu formule circulare de tip „țintește termenul principal X".

## Cuvântul țintă per pagină

- **Homepage → termen de CATEGORIE**, nu un serviciu anume. Ex.: pentru o agenție de
  marketing, „agenție marketing digital", nu „tiktok ads". Homepage-ul reprezintă tot
  business-ul.
- **Pagini de serviciu → cuvântul acelui serviciu** (ex. `/google-ads` → „servicii
  google ads"), cel mai relevant și cu intenție comercială.
- **Pagini legale / utilitare** (politică de confidențialitate, termeni, cookies,
  sitemap, coș, cont, autentificare, „mulțumim", arhive tag/autor/paginare) → **fără
  cuvânt țintă, fără blueprint.** Nu sunt menite să rankeze. Rămân **indexabile** (nu
  le pune `noindex`) — politica de confidențialitate e obligatorie pe orice site.
- Un cuvânt cu **relevanță < 30/100** față de servicii NU e o țintă validă. Nu
  fabrica o țintă slabă dacă nu există o potrivire bună — marchează pagina „fără
  țintă" / orphan.
- **Un singur cuvânt principal per pagină.** Dacă două pagini țintesc același cuvânt →
  canibalizare: alege una, reorientează cealaltă.
- Cuvinte de brand pur („nume firmă", „nume firmă d.o.o", „nume firmă SRL") nu sunt
  ținte — site-ul deja rankează #1 pe numele lui.
- **Varianta locală a cuvântului homepage-ului** („… {oraș}") se folosește doar dacă
  SEO local e activ **și** există un oraș principal setat.

## Universul de cuvinte cheie (curățenie)

- Expandarea din autocomplete produce zgomot. Un cuvânt care **nu conține niciun
  token de serviciu sau de seed** și **nu are volum de căutare** = drift, se elimină.
- **Typo-uri și scrieri greșite** ale brandului/serviciilor (ex. „resselsup" pentru
  „salesup") → gunoi, se elimină.
- Sufixe de formă juridică (`d.o.o`, `s.r.l`, `SRL`, `GmbH`, `Ltd`) → se elimină.
- Volumul se completează din Keyword Planner; când lipsește, potențialul se afișează
  calitativ („poziție X → Y"), nu se inventează o cifră.

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

## Articole de blog (conținut de suport)

- Articolele de suport țintesc **long-tail informațional/comercial** din același cluster ca o
  pagină-bani, pentru cuvinte **fără pagină proprie** și cu relevanță ≥ 40.
- Fiecare articol **linkează intern către pagina-bani** a clusterului, cu o ancoră **naturală și
  variată** (nu exact-match pe fiecare articol, nu „aici"/„click aici").
- Cadență realistă: ~2–4 articole/lună pentru un site mic; planul le împarte pe 30/60/90.
- Structura obligatorie: H1 cu cuvântul cheie, „## Pe scurt" la început (răspuns direct), H2-uri
  scanabile, „## Întrebări frecvente", lungime ≈ cel mai bun competitor.
- Interzis: statistici/procente inventate, promisiuni de poziție/trafic, clișee AI, copiere după
  competitor.
- Se publică **live** doar după ce trec toate verificările (`checkArticle`). Cu „Publică automat"
  activat, un articol care trece tot merge live fără clic; altfel e nevoie de un clic.

## Estimări de trafic

- **Întotdeauna un interval** (`low`–`high`) cu ipoteze vizibile și nivel de
  încredere. Niciodată o singură cifră „garantată".
- **Fără creștere > 2× de la o lună la alta** pentru un site fără istoric/autoritate.
- Ramp-up: lunile 1–2 mișcare mică (Google reindexează), creștere graduală după.
- Când traficul organic curent e ~0, proiecția în timp e zgomot → folosește
  **potențialul bottom-up** (suma pe pagini: volum × CTR la poziția țintă), marcat
  clar „dacă paginile ajung pe pozițiile țintă".
- Cu Search Console conectat → încredere „medie/mare"; doar din model de cuvinte →
  „scăzută".

## Aplicare pe site

- Se scriu automat **doar** meta title / meta description / alt text, **doar** cu
  confirmare explicită, **doar** pe WordPress conectat, cu valoarea veche salvată
  pentru rollback.
- Linkurile interne și redirect-urile 301 rămân **plan**, nu se execută automat.
- Conținutul se publică **doar ca draft**.

## Ce semnalează agentul

- Homepage țintind un serviciu în loc de o categorie.
- Pagină legală/utilitară cu blueprint sau cuvânt țintă.
- Cuvânt țintă irelevant, typo, sau nume de firmă.
- Două pagini pe același cuvânt (canibalizare) nerezolvată.
- Recomandare de SEO local pe un site setat „național".
- Orice text care promite o poziție sau o cifră de trafic garantată.
- Explicație circulară sau cu jargon neexplicat.
- Estimare care nu e interval, sau creștere nerealistă lună-la-lună.
