# Chrome-Erweiterung: Schichtplaner fuer Jarvis

## Lokal installieren

1. In Chrome `chrome://extensions` oeffnen.
2. Den Entwicklermodus aktivieren.
3. `Entpackte Erweiterung laden` waehlen.
4. Diesen Ordner `ChromeExtension` auswaehlen.
5. In den Erweiterungsdetails `Erweiterungsoptionen` oeffnen.
6. `https://eqx-portal.corp.equinix.com` als ODIN-GO-Adresse speichern und den
   App-Schluessel hinterlegen.

Die Erweiterung akzeptiert fuer Jarvis ausschliesslich HTTPS. Eine HTTP-Adresse
wird mit einer verstaendlichen Mixed-Content-Warnung abgelehnt und weder fuer
das iframe noch fuer API-Aufrufe verwendet.

Danach erscheint auf `https://jarvis-emea.equinix.com/` der runde Button
`GO`. Er kann mit gedrueckter Maustaste frei verschoben werden. Die Position
wird lokal und nach erfolgreicher Jarvis-Verifizierung je Mitarbeiter auf der
VM gespeichert. Der Adminbereich wird mit dem in der VM-Konfiguration gesetzten
Passwort entsperrt. In der aktuellen Entwicklungsphase ist der Standard `root`.

Beim Oeffnen liest die Erweiterung Name und Equinix-E-Mail aus dem sichtbaren,
bereits per SSO angemeldeten Jarvis-Profil. Falls das Profil noch nicht erkannt
wurde, einmal oben rechts das Jarvis-Benutzermenue oeffnen. Das Backend gleicht
die E-Mail mit dem Mitarbeiterbestand ab und stellt eine zeitlich begrenzte
Identitaetsfreigabe aus. Ohne diesen Abgleich koennen keine Wuensche gespeichert
oder gelesen werden.

Fuer den spaeteren Rollout sollte die Erweiterung als signiertes Unternehmenspaket
ueber die zentrale Chrome-Richtlinie verteilt werden.

## Update-Modell ab Version 0.9

Die Erweiterung ist eine stabile Bruecke zwischen Jarvis und ODIN GO. Sie
uebernimmt nur die Jarvis-Integration, SSO-Verifizierung, Notifications und das
Oeffnen des Kontextfensters. Navigation, Design und Anwendungsfunktionen werden
von der VM ueber `/odin-go` geladen. Dadurch reicht fuer normale Updates ein
Update der VM; die Erweiterung muss nicht erneut auf allen PCs verteilt werden.

Eine neue Erweiterungsversion ist nur noch erforderlich, wenn sich die
Jarvis-Integration, Chrome-Berechtigungen, SSO-Erkennung oder die sichere
Kommunikation zwischen Jarvis und VM selbst aendert.

## Einstellungen zentral verteilen (empfohlen)

Bisher musste jeder Mitarbeiter den App-Schlüssel selbst in den Erweiterungsoptionen eintragen. Fehlt er
oder ist er nach einer Schlüsselrotation veraltet, antwortet das Backend mit „Invalid local application key“
(HTTP 401): Das Profil wird erkannt, aber ODIN GO ist „nicht erreichbar“. Das betrifft nur einzelne PCs.

Ab Version 0.9.14 liest die Erweiterung ihre Einstellungen in dieser Reihenfolge:

1. **Unternehmens-Richtlinie** (`chrome.storage.managed`, Schema: `managed_schema.json`)
2. Werte, die auf diesem PC in den Optionen gespeichert wurden
3. Chrome-Sync des Profils

Die IT kann `plannerUrl` und `apiKey` per Chrome-Richtlinie für alle PCs setzen (Intune/GPO,
Richtlinie „3rdparty“ der Erweiterung), z. B.:

```json
{
  "3rdparty": {
    "extensions": {
      "<Erweiterungs-ID>": {
        "plannerUrl": "https://eqx-portal.corp.equinix.com",
        "apiKey": "<SHIFTPLANNER_API_KEY>"
      }
    }
  }
}
```

Diese Werte haben Vorrang, die Optionsseite zeigt sie gesperrt an. Bei einer Schlüsselrotation reicht dann
eine einzige Änderung der Richtlinie. Den Schlüssel nicht in das Repository schreiben.

## Jarvis-Benutzer erkennen

Der Benutzer wird zuerst aus dem sichtbaren Jarvis-Profil gelesen. Ist es nicht geöffnet oder anders aufgebaut,
liest die Erweiterung ihn aus der Mendix-Sitzung der Seite (`mx.session`). Dafür braucht sie die
Berechtigung `scripting`.
