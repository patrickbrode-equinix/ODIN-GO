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

### Clean installation on Ubuntu with Portainer

This stack is designed to start with an empty, independent `shiftplanner`
database. It never reads an existing ODIN database. Import employees and plans
afterwards through the application Excel upload.

The Git repository contains application code, database schema, migrations, and
planning rules only. It does not contain employee records, shift plans, drafts,
Excel uploads, database dumps, or production secrets. A fresh installation
creates only the technical schema and the local administrator with password
`root`.

1. In Portainer remove the old `odin_go` stack and select **Remove volumes**.
   This is required for a clean start; it deletes only the old ODIN GO database
   and upload volumes.
2. Create the stack from this Git repository with `docker-compose.yml`.
3. In Portainer provide only `DB_PASSWORD`, `JWT_SECRET`,
   `SHIFTPLANNER_API_KEY`, and `ODIN_HOSTNAME`. Do not add
   `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DB_HOST`, `DB_PORT`,
   `DB_NAME`, or `DB_USER`: these values are fixed consistently by the stack.
   Do not add a custom `CADDY_CONFIG` variable.
4. Deploy the stack. PostgreSQL creates `shiftplanner` and `shiftplanner_app`
   automatically, then backend, frontend, and Caddy start in that order.
   The current stack uses a versioned empty database volume, so an earlier
   failed installation with different database credentials is not reused.
5. Open `https://<ODIN_HOSTNAME>:8443/api/health`. The normal app URL is
   `https://<ODIN_HOSTNAME>:8443`.

The default standalone admin password is `root`. Change it after the first
login in the application admin settings. Internal hostnames use Caddy's
internal CA; managed clients must trust that CA before Chrome can embed ODIN GO
inside HTTPS Jarvis.

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

In den Chrome-Erweiterungsoptionen wird nur die VM-Adresse gespeichert. Name und
E-Mail werden aus dem angemeldeten Jarvis-SSO-Profil uebernommen. Die Erweiterung
greift ausschliesslich auf die HTTP-API des Schichtplaners zu.
Datenbankzugangsdaten werden niemals im Browser hinterlegt.

Die aktuelle Erweiterung uebernimmt die im sichtbaren Jarvis-SSO-Profil
angezeigte Equinix-E-Mail und gleicht sie serverseitig mit dem importierten
Mitarbeiter ab. Daraus entsteht eine vier Stunden gueltige, signierte
Identitaetsfreigabe. Persoenliche Wuensche koennen ohne diese Freigabe weder
gelesen noch gespeichert werden. Fuer eine kryptografische Pruefung direkt beim
Identity Provider ist spaeter zusaetzlich eine freigegebene Entra-App oder ein
offizieller Jarvis-Identity-Endpunkt erforderlich.

Die lokale Installation ist in `ChromeExtension/README.md` beschrieben.
