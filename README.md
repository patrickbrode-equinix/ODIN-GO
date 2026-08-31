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

### Installation auf Ubuntu mit Portainer

1. Das Repository in Portainer unter **Stacks → Add stack → Git repository**
   hinterlegen und als Compose-Datei `docker-compose.yml` verwenden.
2. Die Variablen aus `.env.example` als Stack-Umgebungsvariablen setzen. Für
   `DB_PASSWORD`, `JWT_SECRET` und `SHIFTPLANNER_API_KEY` unbedingt eigene,
   lange Zufallswerte verwenden.
3. Den Stack deployen. Portainer baut die Images und wartet über die
   Healthchecks automatisch auf PostgreSQL, Backend und Frontend.
4. Die Oberfläche ist anschließend über `http://<VM-IP>:8080` erreichbar.
   Für einen vorgeschalteten HTTPS-Reverse-Proxy kann ausschließlich Port 8080
   veröffentlicht werden; Backend-Port 8001 muss nicht öffentlich erreichbar sein.

Die persistenten Volumes `shiftplanner_postgres_data` und
`shiftplanner_uploads_data` dürfen bei Updates nicht gelöscht werden. Ein Update
erfolgt durch erneutes Deployen des Stacks mit **Pull latest image/build**.

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
