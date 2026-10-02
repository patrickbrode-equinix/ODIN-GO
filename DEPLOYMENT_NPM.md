# ODIN GO hinter Nginx Proxy Manager

## Zielarchitektur

```text
Jarvis / Browser -> HTTPS :443 -> Nginx Proxy Manager (TLS)
  -> HTTP 10.144.148.202:8080 -> frontend:8000
  -> /odin-go/* -> Frontend SPA
  -> /api/* und /uploads/* -> backend:8001 (intern)
  -> postgres:5432 (intern)
```

Nur das Frontend veroeffentlicht `8080:8000`. Backend und Frontend verwenden
`shiftplanner-net`; das Backend hat nur `expose: ["8001"]`, keine Host-Ports.
Der Frontend-Produktionsserver verwendet `BACKEND_URL=http://backend:8001`.
Sein Proxy wird am Root eingehaengt und behaelt Pfad und Query unveraendert:
`/api/health/ready` erreicht das Backend als `/api/health/ready`.
`/healthz` wird lokal beantwortet; `/odin-go/shiftplan` liefert die Frontend-SPA.

## Nginx Proxy Manager

Den vorhandenen Proxy Host unter **Hosts -> Proxy Hosts** bearbeiten:

- Domain Names: `eqx-portal.corp.equinix.com`
- Scheme: `http`
- Forward Hostname / IP: `10.144.148.202`
- Forward Port: `8080`
- Cache Assets: aus
- Block Common Exploits: ein
- Websockets Support: ein
- Access List: die vorhandene Zugriffsliste beibehalten

Unter **SSL** das vorhandene Unternehmenszertifikat fuer die Domain auswaehlen:

- Force SSL: **ON**
- HTTP/2 Support: **ON**

NPM uebernimmt TLS auf den bestehenden produktiven Ports 80/443.
Keine Custom Locations fuer `/api` oder `/odin-go` hinzufuegen. Vorhandene
ODIN-spezifische Custom Locations und eigene `proxy_pass`-Overrides entfernen,
damit alle Requests mit unveraendertem Pfad und Query denselben Upstream nutzen.

## Portainer: bestehenden Stack aktualisieren

1. Git-Referenz `main` und Compose-Datei `docker-compose.yml` verwenden.
   Den vorhandenen Stack, seinen Namen und seine Volumes beibehalten.
2. `DB_PASSWORD`, `JWT_SECRET` und PostgreSQL-Zugangsdaten unveraendert lassen.
   `DB_PASSWORD` kommt weiterhin ausschliesslich aus der vorhandenen Environment;
   kein Passwort in Git hinterlegen. `shiftplanner_postgres_data_v2` und
   `shiftplanner_uploads_data` bleiben erhalten.
3. Environment pruefen:
   `CORS_ORIGINS=https://jarvis-emea.equinix.com,https://eqx-portal.corp.equinix.com`
   und `COC_PUBLIC_URL=https://eqx-portal.corp.equinix.com`.
   Die obsolete Proxy-Port-Variable aus der Stack-Environment entfernen.
4. Nur `SHIFTPLANNER_API_KEY` bei der geplanten manuellen Rotation aendern;
   den passenden Key auch in den Jarvis-Erweiterungsoptionen aktualisieren.
   Bis dahin den vorhandenen Key beibehalten.
5. **Pull and redeploy** mit Neubau der lokalen Frontend-/Backend-Images
   ausfuehren. Kein Reset-Skript und kein `docker compose down -v` verwenden.
   Falls Portainer den alten Proxy-Container als verwaisten Container behaelt,
   nur diesen alten Proxy-Container entfernen, keine Volumes.
6. NPM auf den oben beschriebenen Upstream umstellen und die Pfade pruefen.

## Validierung

```sh
docker compose config --quiet
npm test --prefix Backend
npm run build --prefix Frontend
npm test --prefix Frontend
docker compose exec frontend wget -qO- http://frontend:8000/healthz
docker compose exec frontend wget -qO- http://frontend:8000/api/health/ready
docker compose exec frontend wget -qO- http://frontend:8000/odin-go/shiftplan
```

Der Frontend-Servertest prueft echte HTTP-Requests gegen einen lokalen
Backend-Testserver, inklusive unveraendertem API-/Upload-Pfad, Query und Key,
sowie Healthcheck und SPA-Fallback mit dem Production Build.
Die Docker-Pruefungen nach dem Redeploy pruefen zusaetzlich das echte
Docker-Netz und die Bereitschaft des produktiven Backends.

Auch ueber VM und TLS testen:

```text
http://10.144.148.202:8080/healthz
http://10.144.148.202:8080/api/health/ready
http://10.144.148.202:8080/odin-go/shiftplan
https://eqx-portal.corp.equinix.com/api/health/ready
https://eqx-portal.corp.equinix.com/odin-go/shiftplan
```

Der Ready-Endpunkt muss HTTP 200 und `ready: true` liefern; der SPA-Pfad HTML.
Danach das ODIN-GO-Fenster in Jarvis oeffnen und auf TLS-, CORS- und
Timeout-Fehler pruefen.

## Proxy-Logs

API-Key, Identity-Token und Admin-Token werden beim ersten iframe-Aufruf
als Query-Parameter uebergeben und im Frontend sofort in `sessionStorage`
uebernommen. Proxy-Access-Logs duerfen keine Query-Strings persistieren.
