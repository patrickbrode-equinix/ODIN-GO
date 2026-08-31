# Chrome-Erweiterung: Schichtplaner fuer Jarvis

## Lokal installieren

1. In Chrome `chrome://extensions` oeffnen.
2. Den Entwicklermodus aktivieren.
3. `Entpackte Erweiterung laden` waehlen.
4. Diesen Ordner `ChromeExtension` auswaehlen.
5. In den Erweiterungsdetails `Erweiterungsoptionen` oeffnen.
6. VM-Adresse des Schichtplaners speichern.

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
