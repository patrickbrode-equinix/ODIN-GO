# Merged – Start (Windows)

Diese Version startet **Backend + Frontend zusammen**, damit du keine `ECONNREFUSED` / `500` Proxy-Fehler mehr bekommst.

## 1) Erstinstallation

PowerShell im Projektordner öffnen (da wo `package.json` liegt) und ausführen:

```powershell
npm run install:all
```

## 2) Entwicklung starten (Backend + Frontend)

```powershell
npm run dev
```

Danach:
- Frontend: http://localhost:5173
- Backend Health: http://localhost:5055/api/health

## 3) Backend-Konfiguration (PostgreSQL)

Das Backend erwartet Postgres-Env-Variablen. Kopiere dafür im Ordner `db`:

- `db/.env.example` -> `db/.env`

und trage deine Werte ein.

Wenn du **noch kein Postgres** hast, startet das Backend zwar, aber DB-Calls können fehlschlagen.

## 4) Typische Fehler

### `/api/*` im Browser: `ECONNREFUSED`
➡️ Backend läuft nicht. Nutze `npm run dev` (Root), nicht nur `vite`.

### `/api/metrics` / `/api/schedules` 401
➡️ Du bist nicht eingeloggt (die Routen sind geschützt). Login zuerst.
