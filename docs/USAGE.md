# Ghid de utilizare

## 1. Cont

Deschide aplicația web, `/login` → creează cont cu email + parolă, confirmă emailul, autentifică-te.

## 2. Adaugă un site

`Site nou` → introdu domeniul (fără `https://`) și alege tipul:

- **Universal** — pentru orice site. Doar citire: primești un raport de recomandări.
- **WordPress** — permite aplicarea automată de fix-uri sigure (meta, alt text).

## 3. Verifică proprietatea (site universal)

Pe pagina site-ului, alege o metodă și aplic-o, apoi apasă **Verifică**:

| Metodă | Ce faci |
|---|---|
| Meta tag | Adaugi `<meta name="seo-tool-verification" content="TOKEN">` în `<head>` |
| Fișier HTML | Urci `/TOKEN.html` cu conținutul `TOKEN` |
| DNS TXT | Adaugi o înregistrare TXT `seo-tool-verification=TOKEN` pe domeniul apex |

## 4. Conectează WordPress (opțional)

În WordPress: **Utilizatori → Profil → Application Passwords**, generează una nouă.
În aplicație: lipește URL-ul site-ului, utilizatorul și parola de aplicație. Parola e criptată la rest.

## 5. Conectează Google Search Console (opțional, recomandat)

Butonul **Conectează** de pe pagina site-ului pornește fluxul OAuth. Conectat = baseline de trafic din
date reale și încredere mai mare a estimării.

## 6. Pornește un crawl

Buton **Pornește crawl**. Progresul apare live. Pipeline-ul: crawl → date de viteză (PSI/CrUX) →
scoring → recomandări → estimare de trafic. Limită implicită: 2.000 pagini / crawl.

## 7. Citește rezultatele

- **Scor site** 0-100 + breakdown pe 5 categorii (tehnic, CWV, on-page, conținut, GEO).
- **Pagini** — tabel sortabil; click pe o pagină pentru probleme + recomandări.
- **Recomandări** — prioritizate impact×efort, cu explicație. Pe site-uri WordPress conectate,
  cele marcate „auto” au buton **Aplică automat** (scrii un meta title/description sau alt text nou;
  valoarea veche se păstrează pentru **Anulează fix-ul**).

## 8. Estimarea de trafic

Întotdeauna un **interval** (pesimist / mijloc / optimist) pe un orizont de luni, cu asumpțiile listate
și un nivel de încredere. **Nu este o promisiune** — datele din industrie arată că rezultatele SEO apar
în 4-12 luni, iar mișcarea în primele 1-2 luni e minimă. Butonul **Recalculează** rulează estimatorul din nou.

## 9. Export

Din pagina unui crawl: **Export CSV** (pagini + scoruri) sau **Raport imprimabil** → „Salvează ca PDF”
din dialogul de print al browserului.

## 10. Datele tale

`/privacy` — exportă tot ca JSON sau șterge definitiv contul.
