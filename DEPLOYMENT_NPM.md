# ODIN GO hinter Nginx Proxy Manager

## Zielarchitektur

```text
Jarvis / Browser -> HTTPS :443 -> Nginx Proxy Manager (TLS)
  -> HTTP :8081 -> ODIN Caddy (interner HTTP-Router)
  -> /api/* und /uploads/* -> backend:8001
  -> alle anderen Pfade -> frontend:8000
  -> postgres:5432 im Docker-Netz
```

NPM benoetigt genau einen Upstream. Caddy nutzt kein eigenes TLS und mountet
das versionierte Repository-Verzeichnis `caddy/` read-only nach `/etc/caddy`.
Darin liegt `Caddyfile` als regulaere Datei. Der Pfad `/odin-go/*` wird unveraendert an den
Frontend-Server weitergegeben; `/api/*` und `/uploads/*` gehen direkt an das
Backend.

## Nginx Proxy Manager

Unter **Hosts -> Proxy Hosts -> Add Proxy Host** eintragen:

- Domain Names: `eqx-portal.corp.equinix.com`
- Scheme: `http`
- Forward Hostname / IP: `10.144.148.202`
- Forward Port: `8081`
- Cache Assets: aus
- Block Common Exploits: ein
- Websockets Support: ein
- Access List: die bereits fuer das interne Portal vorgesehene Zugriffsliste;
  falls keine existiert, `Publicly Accessible` nur im internen Firmennetz

Unter **SSL**:

- das fuer `eqx-portal.corp.equinix.com` ausgestellte interne
  Unternehmenszertifikat auswaehlen oder importieren
- Force SSL: ein
- HTTP/2 Support: ein
- HSTS: erst einschalten, nachdem Zertifikat und HTTPS-Aufruf auf allen
  verwalteten Clients erfolgreich getestet wurden
- HSTS Subdomains: aus

Im Feld **Advanced** ist keine zusaetzliche Location und kein `proxy_pass`
notwendig. NPM soll Pfad und Query unveraendert an Port 8081 weiterreichen.

## Portainer

1. Im Git-verwalteten Stack die vorhandenen Secrets unveraendert lassen.
2. `CORS_ORIGINS` exakt auf
   `https://jarvis-emea.equinix.com,https://eqx-portal.corp.equinix.com` setzen.
3. `COC_PUBLIC_URL` auf `https://eqx-portal.corp.equinix.com` setzen.
4. `ODIN_PROXY_PORT` auf `8081` setzen. Veraltete Variablen `ODIN_HOSTNAME`,
   `HTTP_PORT`, `HTTPS_PORT`, `FRONTEND_PORT` und `BACKEND_PORT` duerfen
   entfernt werden; sie werden nicht mehr ausgewertet.
5. **Pull and redeploy** ausfuehren. Keine Volumes entfernen.

## Pruefungen

```text
http://10.144.148.202:8081/api/health/ready
http://10.144.148.202:8081/odin-go/shiftplan
https://eqx-portal.corp.equinix.com/api/health/ready
https://eqx-portal.corp.equinix.com/odin-go/shiftplan
```

Der Health-Endpunkt muss HTTP 200 und `ready: true` liefern. Danach in Jarvis
das ODIN-GO-Fenster oeffnen und DevTools auf Mixed Content, TLS-, CORS- und
Timeout-Fehler pruefen.

## Security-Hinweis

API-Key, Identity-Token und Admin-Token werden heute beim ersten iframe-Aufruf
als Query-Parameter an das Frontend uebergeben und dort sofort in
`sessionStorage` uebernommen. Die Extension loggt diese Werte nicht. Die
Umstellung auf einen kurzlebigen Bootstrap-Code oder einen bestaetigten
`postMessage`-Handshake betrifft Extension, Frontend und Backend gemeinsam und
sollte als separate, getestete Auth-Migration erfolgen. Bis dahin duerfen
Proxy-Access-Logs keine Query-Strings persistieren.
