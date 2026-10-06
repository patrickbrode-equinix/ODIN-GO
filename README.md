# ODIN Schichtplaner

ODIN GO ist der Schichtplaner mit Frontend, Backend und eigener
PostgreSQL-Datenbank. Es gibt zwei Zugaenge mit derselben Oberflaeche
(`/odin-go/*`):

- **Jarvis-Chrome-Erweiterung** (`ChromeExtension`): Mitarbeiter werden ueber ihr
  Jarvis-SSO-Profil erkannt und sehen u.a. ihre persoenlichen Wuensche.
- **Webzugang** fuer Fuehrungskraefte ohne taegliche Jarvis-Nutzung. Die Anmeldung
  erfolgt mit dem Admin-Passwort (`SHIFTPLANNER_ADMIN_PASSWORD`). Persoenliche
  Wuensche werden dort nicht angeboten.

Enthalten sind insbesondere:

- Dienstplan, Wochenplan, Tagesplan und Drafts
- Generator fuer Monats- und Jahresplanung
- Schichtuebergabe, Fremdteam-Tickets, Projekte, Notifications, Feedback, Umfragen
- Mitarbeiterwuensche (Schichten, Feiertage, Wunschkollegen, Urlaub, nicht
  verfuegbare Wochentage)
- Admin-Einstellungen und Benutzerverwaltung

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
2. Im Projektordner starten:

   ```powershell
   docker compose up -d --build
   ```

3. Die Anwendung unter `http://localhost:8080` oeffnen.

Der Backend-Status ist ueber `http://localhost:8080/api/health` und
`/api/health/ready` erreichbar.

### Produktivbetrieb auf der internen VM mit Portainer

Nginx Proxy Manager ist der TLS-Endpunkt auf Port 443 und leitet per HTTP an
das Frontend auf Host-Port 8080 weiter (`8080:8000`). Der Frontend-Server
proxyt `/api/*` und `/uploads/*` mit unveraendertem Pfad an `odin-backend:8001`.
Das Backend ist nur im Docker-Netz erreichbar. `/odin-go/*` liefert die SPA.

1. Den vorhandenen Git-verwalteten Stack nicht loeschen und keine Volumes
   entfernen.
2. `CORS_ORIGINS` auf
   `https://jarvis-emea.equinix.com,https://eqx-portal.corp.equinix.com` setzen.
3. Nginx Proxy Manager fuer `eqx-portal.corp.equinix.com` per HTTP an
   `10.144.148.202:8080` weiterleiten lassen.
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
