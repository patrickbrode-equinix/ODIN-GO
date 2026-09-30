# ODIN Schichtplaner

Dieser Ordner ist eine eigenstaendig startbare Auskopplung des Schichtplaners.
Er enthaelt Frontend, Backend und eine eigene PostgreSQL-Datenbankkonfiguration.
Die ODIN-Ticketzuweisung, Queue-Anbindung, Crawler-Routen und Writeback-Funktionen
sind im Modus `shiftplanner` deaktiviert.

Die Anwendung startet ohne Login direkt im Schichtplan. Es gibt keine Anmeldung,
Registrierung, Passwortverwaltung oder Abmeldung. Der lokale Betrieb besitzt
innerhalb dieser eigenstaendigen Anwendung volle Planungsrechte.

Enthalten sind insbesondere:

- Schichtplan und Schichtplaner-Steuerung
- Monats- und Jahresplanung sowie Drafts
- Mitarbeiterverwaltung und Mitarbeiterwuensche
- Schichtplan-Einstellungen und Pruefungen
- TV-Ansicht des Schichtplans
- optionale Teams- und Verifizierungsfunktionen

## Lokaler Start mit npm

Im Hauptordner ausfuehren:

```powershell
npm run setup
npm run dev
```

`npm run setup` richtet einmalig die eigene lokale Datenbank `shiftplanner` und
den eigenen Datenbankbenutzer `shiftplanner_app` ein. Die ODIN-Datenbank wird
nicht verwendet. Beim ersten Start werden fehlende Pakete fuer Backend und
Frontend automatisch installiert. Danach ist die Anwendung unter
`http://127.0.0.1:5173` erreichbar.

## Start als Container

1. `.env.example` als `.env` ablegen und Passwoerter sowie `JWT_SECRET` setzen.
2. Im Ordner `Schichtplaner` starten:

   ```powershell
   docker compose up -d --build
   ```

3. Die Anwendung unter `http://localhost:8080` oeffnen.

Der Backend-Status ist unter `http://localhost:8001/api/health` erreichbar und
liefert im Standalone-Betrieb `"appMode": "shiftplanner"`.

### Produktivbetrieb auf der internen VM mit Portainer

Nginx Proxy Manager ist der einzige TLS-Endpunkt auf Port 443. Der Frontend-
Server liefert die SPA inklusive `/odin-go/*` aus und leitet `/api/*` sowie
`/uploads/*` im Docker-Netz an `backend:8001` weiter. Ein zusaetzlicher Caddy-
Container ist daher nicht erforderlich.

1. Den vorhandenen Git-verwalteten Stack nicht loeschen und keine Volumes
   entfernen.
2. `CORS_ORIGINS` auf
   `https://jarvis-emea.equinix.com,https://eqx-portal.corp.equinix.com` und
   `COC_PUBLIC_URL` auf `https://eqx-portal.corp.equinix.com` setzen.
3. Nginx Proxy Manager fuer `eqx-portal.corp.equinix.com` per HTTP an
   `fr2lxcops01.corp.equinix.com:8080` weiterleiten lassen.
4. In Portainer **Pull and redeploy** ausfuehren. PostgreSQL- und Upload-
   Volumes bleiben erhalten.
5. `https://eqx-portal.corp.equinix.com/api/health/ready` und
   `https://eqx-portal.corp.equinix.com/odin-go/shiftplan` testen.

Die exakten NPM-Felder und Tests stehen in `DEPLOYMENT_NPM.md`.

For later upgrades, keep the volumes. The `scripts/reset-clean-install.sh`
script intentionally removes them only when started with `RESET_ODIN_GO=YES`.

## Wichtiger Hinweis

Die Datenbank verwendet ein eigenes Docker-Volume. Sie greift nicht automatisch
auf die Datenbank des bisherigen ODIN-Stacks zu. Eine spaetere Datenuebernahme
kann deshalb kontrolliert und getrennt umgesetzt werden.

## Chrome-Erweiterung fuer Jarvis

Die Erweiterung liegt im Ordner `ChromeExtension`. Sie fuegt auf
`https://jarvis-emea.equinix.com/` einen Button `DIENSTPLAN` ein und oeffnet ein
seitliches Kontextfenster mit Dienstplan, Wochenplan, Tagesplan und persoenlichen
Wuenschen. Der mit Passwort geschuetzte Adminbereich enthaelt Planer-Einstellungen,
Generator und User Management.

In den Chrome-Erweiterungsoptionen wird die HTTPS-Adresse
`https://eqx-portal.corp.equinix.com` gespeichert. Name und
E-Mail werden aus dem angemeldeten Jarvis-SSO-Profil uebernommen. Die Erweiterung
greift ausschliesslich per HTTPS auf die API des Schichtplaners zu.
Datenbankzugangsdaten werden niemals im Browser hinterlegt.

Die aktuelle Erweiterung uebernimmt die im sichtbaren Jarvis-SSO-Profil
angezeigte Equinix-E-Mail und gleicht sie serverseitig mit dem importierten
Mitarbeiter ab. Daraus entsteht eine vier Stunden gueltige, signierte
Identitaetsfreigabe. Persoenliche Wuensche koennen ohne diese Freigabe weder
gelesen noch gespeichert werden. Fuer eine kryptografische Pruefung direkt beim
Identity Provider ist spaeter zusaetzlich eine freigegebene Entra-App oder ein
offizieller Jarvis-Identity-Endpunkt erforderlich.

Die lokale Installation ist in `ChromeExtension/README.md` beschrieben.
