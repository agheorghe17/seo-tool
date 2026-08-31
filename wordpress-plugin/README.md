# SEO Audit Connector — plugin WordPress

Plugin companion pentru platforma SEO Audit. Rezolvă problema header-ului `Authorization`
pe hosturi partajate (ex. RoMarg), dă o pagină de unde generezi parola de conectare cu un
click, și expune un namespace REST propriu (`seo-audit/v1`) folosit de aplicație — care merge
și când `wp/v2` e restricționat.

## Build (creează .zip-ul de instalat)

Din acest folder:

```bash
cd wordpress-plugin
zip -r seo-audit-connector.zip seo-audit-connector -x '*.DS_Store'
```

Pe Windows PowerShell:

```powershell
Compress-Archive -Path .\seo-audit-connector -DestinationPath .\seo-audit-connector.zip -Force
```

## Instalare

1. WordPress → **Plugins → Add New → Upload Plugin** → alege `seo-audit-connector.zip` → **Install Now** → **Activate**.
2. **Settings → SEO Audit** → **Generează parolă de conectare** → copiază parola afișată (o singură dată).
3. În aplicația SEO Audit → site → **Conectează WordPress**:
   - URL site: cel afișat pe pagina Settings → SEO Audit
   - Utilizator: cel afișat (contul tău de admin)
   - Application Password: cea generată la pasul 2

## Verificare manuală

```bash
curl -u "USER:APP_PASSWORD_FARA_SPATII" "https://SITE/wp-json/seo-audit/v1/ping"
```

Răspuns 200 cu `"ok": true`, `"seo_plugin"`, `"user".caps` → gata.

## Ce face

| Funcție | Detaliu |
|---|---|
| Fix header Authorization | reconstruiește `PHP_AUTH_USER`/`PHP_AUTH_PW` din `REDIRECT_HTTP_AUTHORIZATION` / `getallheaders()` la încărcarea pluginului |
| `GET /seo-audit/v1/ping` | verificare conexiune, versiuni, capabilități user, plugin SEO (Yoast/Rank Math), tipuri de conținut |
| `GET /seo-audit/v1/resolve?url=` | URL → post/pagină + meta title/description curent |
| `POST /seo-audit/v1/apply` | scrie meta title/description (chei per plugin) sau alt text; întoarce valoarea anterioară |
| `POST /seo-audit/v1/rollback` | rescrie valoarea anterioară |
| Randare proprie | `<title>` + `<meta name="description">` din `_seo_audit_*` când nu e activ Yoast/Rank Math |

Permisiuni: scrierile cer `edit_posts` (+ `upload_files` pentru alt text) și `edit_post` per obiect.
