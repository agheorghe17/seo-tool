=== SEO Audit Connector ===
Contributors: seoaudit
Tags: seo, rest-api, application-passwords
Requires at least: 5.6
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later

Conectează site-ul la platforma SEO Audit.

== Description ==

* Repară transmiterea header-ului `Authorization` către PHP (necesar pentru Application
  Passwords pe multe hosturi partajate — Apache/CGI, LiteSpeed, unele configurări Nginx).
* Adaugă o pagină **Setări → SEO Audit** de unde generezi parola de conectare cu un click.
* Expune un namespace REST propriu, `seo-audit/v1`, cu endpoint-uri:
  * `GET  /seo-audit/v1/ping` — verificare conexiune + capabilități + plugin SEO detectat
  * `GET  /seo-audit/v1/resolve?url=` — mapează un URL la post/pagină + meta curent
  * `POST /seo-audit/v1/apply` — aplică un fix (meta title/description, alt text)
  * `POST /seo-audit/v1/rollback` — revine la valoarea anterioară
  Funcționează chiar dacă `wp/v2` e restricționat de un plugin de securitate.
* Când nu e activ Yoast/Rank Math, randează el `<title>` și `<meta name="description">`
  din câmpuri proprii (`_seo_audit_title`, `_seo_audit_metadesc`).

Toate scrierile cer capabilitatea `edit_posts` (și `upload_files` pentru alt text) și
respectă `edit_post` per obiect.

== Installation ==

1. În WordPress: **Plugins → Add New → Upload Plugin** → încarcă `seo-audit-connector.zip` → Activează.
2. **Setări → SEO Audit** → **Generează parolă de conectare** → copiază parola (se afișează o dată).
3. În platforma SEO Audit: **Conectează WordPress** → pune URL-ul site-ului, utilizatorul afișat și parola.

== Changelog ==

= 0.1.0 =
* Prima versiune.
