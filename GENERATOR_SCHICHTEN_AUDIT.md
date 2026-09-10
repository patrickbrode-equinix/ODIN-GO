# Audit: Generator und Schichtdefinitionen

**Stand:** 10.09.2026  
**Projekt:** `C:\Users\Admin\Desktop\Schichtplaner`  
**Pruefumfang:** Generator, Schichtdefinitionen, Mitarbeiterpraeferenzen, DBS, Entwuerfe, Aktivierung und zugehoerige Migrationen.

## Kurzfazit

Der Generator deckt viele fachliche Regeln bereits sauber ab: harte Sperrtage, unerwuenschte Schichten, Abwesenheiten, Erholung, Serien, Wochenend- und Nachtgrenzen. Die drei wichtigsten offenen Punkte betreffen die Besetzungsobergrenzen, DBS und eine sichere lokale Umplanung.

## Bestaetigte Regeln

- Aktive Eintraege aus `shift_definitions` werden als Grundlage der Planung geladen.
- Halbschichten (`HE*`, `HL*`) und Abwesenheitscodes (`ABW`, `FS`, `S`, `SEMINAR`) werden nicht automatisch im Entwurf verplant.
- Sperrtage aus den Mitarbeiterpraeferenzen werden als harte Ausschlussregel behandelt.
- Unerwuenschte Schichten, einschliesslich Varianten wie `E1WE`, werden als harte Ausschlussregel behandelt.
- Nacht-, Wochenend-, Erholungs- und Wechselregeln werden bei der Kandidatenauswahl geprueft.
- Serien fuer `E1SA`, `E1WE`, `L1WE`, `N` und `DBS` sind montagsbasiert.
- Ein Entwurf kann manuell zellenweise angepasst und danach in den aktiven Schichtplan uebernommen werden.
- Importierte Schichtaenderungen werden mit altem und neuem Wert in `shift_change_log` gespeichert.

## Feststellungen

### P1: Die Auffuelllogik kann `max_staff` bewusst ueberschreiten

**Fundort:** `Backend/lib/shiftplanGeneration.js`, `buildDailyShiftSlots()`.

Die erste Verteilung zusaetzlicher Plaetze beachtet `max_staff`. Eine zweite Auffuellschleife erhoeht danach die Anzahl weiter, wenn noch Sollstunden offen sind. Der Kommentar im Code beschreibt dies als bewusstes Verhalten.

**Risiko:** Eine im Admin-Bereich konfigurierte maximale Besetzung ist keine harte Obergrenze. Es kann mehr Personal auf einer Schicht geplant werden als erlaubt.

**Empfehlung:** Die zweite Auffuellschleife entfernen oder ebenfalls mit `max_staff` begrenzen. Fehlende Sollstunden muessen als Kapazitaetskonflikt sichtbar werden, nicht zu stiller Ueberbesetzung fuehren.

### P1: DBS ist nicht auf genau eine Person pro Woche fest begrenzt

**Fundort:** `Backend/routes/shiftplanControl.js`, `loadDbsPlanningConfig()` und Generierung.

Die DBS-Besetzung wird aus `shiftplan.dbs_required_staff` geladen. Dieser Wert wird direkt als `min_staff` der DBS-Schicht verwendet und kann groesser als eins sein.

**Risiko:** Die aktuell umgesetzte Logik widerspricht der Regel: "pro Woche genau ein Mitarbeiter aus dem DBS-Pool".

**Empfehlung:** `requiredStaff` in der Generatorlogik fest auf `1` setzen, die zugehoerige Admin-Einstellung entfernen und vorhandene Werte per Migration auf `1` normalisieren.

### P1: Es gibt keine isolierte automatische Umplanung einer einzelnen Person

**Fundort:** `Backend/routes/shiftplanControl.js`, `generateShiftPlan()` und `/drafts/generate`.

Die Generierung erstellt einen vollstaendigen Monatsentwurf. Manuelle Aenderungen einer einzelnen Zelle sind moeglich, aber es gibt keinen Generator-Modus, der alle anderen Zuweisungen sperrt und nur eine betroffene Person neu berechnet.

**Risiko:** Eine künftige automatische Anpassung nach einer Praeferenz-Aenderung kann fremde Schichten ungewollt veraendern.

**Empfehlung:** Einen separaten Endpunkt fuer lokale Umplanung bereitstellen: alle anderen Mitarbeiter sperren, nur die betroffene Person berechnen, Unterbesetzung pruefen und jede Aenderung dokumentieren.

### P2: Schichtdefinitionen werden vor dem Speichern nicht umfassend validiert

**Fundort:** `Backend/routes/shiftConfig.js`, `POST` und `PUT /definitions`.

Die API uebernimmt Dauer, Uhrzeiten und Besetzungsgrenzen weitgehend direkt. Es fehlen fachliche Pruefungen wie `min_staff <= max_staff`, gueltige Uhrzeiten, gueltige Wochentage und nicht-negative Dauer.

**Risiko:** Fehlerhafte Schichten koennen gespeichert werden und erst spaeter zu unplausiblen Plaenen oder Stundenwerten fuehren.

**Empfehlung:** Definitionen serverseitig vollstaendig validieren und konkrete Feldfehler an die Oberflaeche geben.

### P2: Die Stundenberechnung kann von der sichtbaren Zeit abweichen

**Fundort:** `Backend/lib/shiftplanGeneration.js`, `getShiftDurationHours()`.

Die Planung vertraut auf `duration_hours`; Startzeit, Endzeit und Tagesversatz werden nicht zur Kontrolle herangezogen.

**Risiko:** Angezeigte Schichtzeit und berechnete Sollstunden koennen voneinander abweichen, besonders bei Nachtschichten.

**Empfehlung:** Die Dauer beim Speichern aus Start-, Endzeit und Tagesversatz berechnen oder Abweichungen ablehnen.

### P2: Manuelle Entwurfsänderungen werden nicht erneut vollstaendig validiert

**Fundort:** `Backend/routes/shiftplanControl.js`, `PATCH /drafts/:id/shifts`.

Die Route ersetzt oder entfernt eine einzelne Zuweisung direkt im Entwurf. Sie prueft weder Schichtcode noch Sperrtage, Ruhezeit, Unterbesetzung oder Ueberbesetzung erneut.

**Risiko:** Ein manuell bearbeiteter Entwurf kann Regelverletzungen enthalten, ohne dass diese vor der Aktivierung sichtbar werden.

**Empfehlung:** Nach jeder manuellen Aenderung die betroffenen Tage und Mitarbeiter validieren; kritische Konflikte vor Aktivierung blockieren oder eindeutig bestaetigungspflichtig machen.

### P2: Doppelte Migrationsnummern erschweren Betrieb und Fehlersuche

**Fundort:** `Backend/db/migrations`.

Mehrere Nummern werden doppelt verwendet, darunter `030`, `041`, `042`, `043`, `045` und `046`. Der aktuelle Runner kann anhand voller Dateinamen arbeiten, die Nummerierung dokumentiert die Reihenfolge jedoch nicht mehr eindeutig.

**Risiko:** Bei Installationen, Rollbacks oder einer Stoerungsanalyse ist die Abfolge schwer nachvollziehbar.

**Empfehlung:** Bereits ausgerollte Dateien nicht umbenennen. Die effektive Reihenfolge dokumentieren und alle neuen Migrationen mit eindeutigen fortlaufenden Nummern anlegen.

### P3: Tests decken die Grundregeln ab, aber nicht alle kritischen Wege

**Fundort:** `Backend/tests/shiftplanGeneration.test.js`.

Vorhanden sind Tests fuer Normalisierung, Serien, harte Sperrtage, unerwuenschte Schichten und Ersatzkandidaten. Es fehlen gezielte Regressionstests fuer die harte `max_staff`-Grenze, DBS mit genau einer Person, manuelle Entwurfsaenderungen und die Aktivierung eines regelkonformen Entwurfs.

## Empfohlene Abnahmetests

1. Einen Plan erzeugen, dessen Sollstunden nur durch Ueberschreiten von `max_staff` erreichbar waeren. Erwartung: Konflikt, keine Ueberbesetzung.
2. Drei DBS-Poolmitarbeiter anlegen. Erwartung: genau eine DBS-Person pro DBS-Woche.
3. Einen Mitarbeiter fuer `E1` sperren. Erwartung: keine `E1`, `E1SA` oder `E1WE`-Zuweisung.
4. Samstag und Sonntag sperren. Erwartung: keine Wochenendschicht.
5. Eine ungueltige Schichtdefinition mit `min_staff > max_staff` speichern. Erwartung: klare Ablehnung.
6. Eine Nachtschicht mit abweichender sichtbarer Zeit und Dauer anlegen. Erwartung: automatische Korrektur oder Ablehnung.
7. Eine manuelle Entwurfsaenderung vornehmen, die eine Schicht unterbesetzt. Erwartung: Konflikt vor der Aktivierung.
8. Eine einzelne Praeferenz aendern und lokal neu planen. Erwartung: alle anderen Zuweisungen bleiben unveraendert.

## Prioritaet fuer die Umsetzung

1. `max_staff` als harte Obergrenze in jeder Generator-Schleife durchsetzen.
2. DBS fest auf eine Person je Woche beschraenken.
3. Lokale Umplanung mit gesperrten Fremdzuweisungen implementieren.
4. Vollstaendige Validierung neuer und manuell geaenderter Schichten ergaenzen.
5. Dauer aus den sichtbaren Zeiten berechnen und mit Tests absichern.

## Schlussfolgerung

Der Generator ist fuer einen kontrollierten Einsatz gut aufgestellt. Die drei P1-Punkte sollten vor einer vollautomatischen oder breit ausgerollten Planung erledigt werden, da sie direkt zu Regelverletzungen im aktiven Schichtplan fuehren koennen.
