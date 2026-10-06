# Ergebnis der Generatorprüfung

6. Oktober 2026: 40 echte Testbenutzer mit gespeicherten Präferenzen in einer separaten PostgreSQL-Datenbank. Die bestehende Anwendungsdatenbank wurde nicht verändert. Die temporäre Datenbank wurde anschließend gestoppt und entfernt.

Der erste Prüflauf zeigte 2.097 Verletzungen der geprüften Wünsche über sieben Läufe: 1.822 Abweichungen von der Schichtauswahl, 237 Dienste an gesperrten Wochentagen, 24 Dienste am gewünschten freien Feiertag und 14 Überschreitungen von Wochenendgrenzen. Einzelne Dienste können mehrere Verletzungen verursachen.

Behoben wurden die stillschweigende Freigabe gesperrter Wochentage, die Rückfalllogik auf andere Schichten bei fehlenden passenden Kandidaten und die Umgehung von Wünschen beim Sollstunden-Ausgleich. Monatswünsche, Wochenendvarianten und kurze Nächte werden auch bei Fortsetzungen und Ersatzvorschlägen geprüft. Persönliche Nacht- und Wochenendgrenzen bleiben verbindlich. Die Schichtauswahl und freie Feiertage bleiben bei aktivierter Wunschberücksichtigung auch mit Wunschgewicht 50 % verbindlich.

Die abschließenden acht Läufe umfassen Januar, Februar und März einzeln, Q1 2027 mit Übergängen zwischen den Monaten und zwei absichtlich unlösbare Läufe bei Wunschgewicht 100 % und 50 %. Ergebnis: **5.114 Zuweisungen und 0 Verletzungen der geprüften Wünsche**.

Im regulären Szenario erhalten 38 von 40 Mitarbeitern Dienste. Sim19 und Sim25 wünschen Sieben-Tage-Nachtblöcke, begrenzen ihre Nächte aber auf drei pro Monat. Diese widersprüchlichen Vorgaben führen zu fehlenden Diensten. Offene Besetzungen und Sollstunden-Defizite werden als Konflikte angezeigt; vollständige Besetzung ist nicht garantiert. Kollegenwünsche und COLO-Aufgaben wurden in diesem Szenario nicht getestet.

Validierung: 536 Backend-Tests bestanden; 61 Frontend-Tests bestanden, ein bestehender Test übersprungen; sechs Proxytests bestanden; Frontend-Build erfolgreich; `git diff --check` ohne Fehler.

Details pro Mitarbeiter und Monat: [Abschließender Prüfbericht](generator-preferences-40-corrected.md). Maschinenlesbare Profile, Zuweisungen und Konflikte: [JSON](generator-preferences-40-corrected.json). Der ursprüngliche Vergleichslauf bleibt in den Dateien mit dem Suffix `baseline` erhalten.

Das reproduzierbare Testskript liegt unter `Backend/scripts/runEmployeePreferenceSimulation.mjs`. Es erlaubt ausschließlich die Testdatenbank `odin_generator_test` auf `127.0.0.1:55439` und verweigert andere Datenbankziele. Es migriert und setzt die Testdatenbank zurück, legt die 40 Profile an und führt den echten Generator aus. Voraussetzung ist eine eigens dafür bereitgestellte leere PostgreSQL-Testinstanz. Benötigte Umgebungswerte: `DB_HOST=127.0.0.1`, `DB_PORT=55439`, `DB_NAME=odin_generator_test`, `DB_USER=odin_generator_test`, leeres `DB_PASSWORD`, leeres `DATABASE_URL`, `APP_MODE=shiftplanner`. Aufruf im Backend-Verzeichnis: `node scripts/runEmployeePreferenceSimulation.mjs corrected`.

Die Korrekturen, das Testskript und die Prüfberichte sind im Repository enthalten.
