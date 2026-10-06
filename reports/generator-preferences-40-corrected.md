# Generatorprüfung mit 40 Mitarbeitern

Lauf: corrected. Echte PostgreSQL-Testdatenbank; bestehende Datenbank unverändert.

40 gespeicherte Mitarbeiterprofile, drei Monatsläufe, Q1 2027 mit Monatsübergängen und ein absichtlich unlösbarer Präferenzfall bei 100% und 50% Wunschgewicht.

| Lauf | Monat | Zuweisungen | Mitarbeiter mit Diensten | Wunschverletzungen |
|---|---|---:|---:|---:|
| monthly | 2027-01 | 595 | 38/40 | 0 |
| monthly | 2027-02 | 514 | 38/40 | 0 |
| monthly | 2027-03 | 654 | 38/40 | 0 |
| quarter | 2027-01 | 595 | 38/40 | 0 |
| quarter | 2027-02 | 516 | 38/40 | 0 |
| quarter | 2027-03 | 654 | 38/40 | 0 |
| stress | 2027-01 | 793 | 40/40 | 0 |
| stress | 2027-01 | 793 | 40/40 | 0 |

Gesamte Wunschverletzungen: **0**

## Grenzen

Geprüft wurden Schichtauswahl einschließlich Monatswünschen, unerwünschte Schichten, gesperrte Wochentage, Urlaub, freier Neujahrstag, individuelle Nacht-/Wochenendgrenzen, kurze Nachtblöcke und Ersatzvorschläge. Kollegenwünsche und COLO-Aufgaben waren nicht Teil dieses Szenarios.

Wünsche haben bei aktivierter Wunschberücksichtigung Vorrang vor Sollstunden und Besetzungszielen. Ruhezeiten und Abwesenheiten gelten zusätzlich. Unlösbare Wünsche führen zu offenen Diensten bzw. ausgewiesenen Sollstunden-Konflikten, nicht zur Garantie vollständiger Besetzung.

Sim19 und Sim25 wünschen ausschließlich Nächte im Sieben-Tage-Modell, begrenzen ihre Nächte aber auf drei pro Monat. Ein vollständiger Block ist damit unmöglich; diese Mitarbeiter erhalten im regulären Szenario keine Dienste. Keine automatische Änderung ihres Modells oder ihrer Schichtwünsche.

## monthly: 2027-01

Konflikte: {"understaffed":72,"target_hours_shortfall":21}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 15 | 15 | 0 | 0 | 168/168 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 1 | 136/168 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 1 | 136/168 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 16 | 16 | 0 | 0 | 168/168 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 2 | 2 | 2 | 1 | 17/168 |
| Sim18 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/168 |
| Sim19 Wunschtest | Nachtdienst | N | – | 0 | 0 | 0 | 0 | 0/168 |
| Sim20 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/168 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 6 | 6 | 6 | 1 | 51/168 |
| Sim22 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 1 | 24/168 |
| Sim23 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 1 | 25.5/168 |
| Sim24 Wunschtest | Nachtdienst | N | – | 6 | 6 | 6 | 2 | 48/168 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 0 | 0 | 0 | 0 | 0/168 |
| Sim26 Wunschtest | Nachtdienst | N | – | 6 | 6 | 6 | 2 | 48/168 |
| Sim27 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 59.5/168 |
| Sim28 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 0 | 24/168 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim33 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim34 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim35 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim36 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/168 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 16 | 0 | 0 | 0 | 128/168 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/168 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 16 | 0 | 0 | 0 | 128/168 |


## monthly: 2027-02

Konflikte: {"understaffed":65,"target_hours_shortfall":30}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 16 | 16 | 0 | 0 | 128/160 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 16 | 16 | 0 | 0 | 128/160 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 16 | 16 | 0 | 0 | 128/160 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 16 | 16 | 0 | 0 | 128/160 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 16 | 16 | 0 | 0 | 128/160 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 15 | 15 | 0 | 0 | 160/160 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 15 | 15 | 0 | 0 | 120/160 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 15 | 15 | 0 | 0 | 120/160 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 14 | 14 | 0 | 0 | 112/160 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 19 | 19 | 0 | 0 | 152/160 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 10 | 10 | 0 | 0 | 80/160 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 15 | 15 | 0 | 0 | 120/160 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 10 | 10 | 0 | 0 | 80/160 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 6 | 6 | 6 | 1 | 51/160 |
| Sim18 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/160 |
| Sim19 Wunschtest | Nachtdienst | N | – | 0 | 0 | 0 | 0 | 0/160 |
| Sim20 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/160 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 2 | 2 | 2 | 0 | 81/160 |
| Sim22 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 1 | 24/160 |
| Sim23 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 59.5/160 |
| Sim24 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/160 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 0 | 0 | 0 | 0 | 0/160 |
| Sim26 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/160 |
| Sim27 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 59.5/160 |
| Sim28 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 0 | 24/160 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim33 Wunschtest | Monatlicher Wechsel | L1 | – | 12 | 12 | 0 | 1 | 96/160 |
| Sim34 Wunschtest | Monatlicher Wechsel | L1 | – | 12 | 12 | 0 | 1 | 96/160 |
| Sim35 Wunschtest | Monatlicher Wechsel | L1 | – | 17 | 17 | 0 | 1 | 136/160 |
| Sim36 Wunschtest | Monatlicher Wechsel | L1 | – | 12 | 12 | 0 | 1 | 96/160 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/160 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 16 | 0 | 0 | 0 | 128/160 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/160 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 16 | 0 | 0 | 0 | 128/160 |


## monthly: 2027-03

Konflikte: {"understaffed":71,"target_hours_shortfall":21}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 18 | 18 | 0 | 0 | 144/184 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 18 | 18 | 0 | 0 | 144/184 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 18 | 18 | 0 | 0 | 144/184 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 18 | 18 | 0 | 0 | 144/184 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 18 | 18 | 0 | 0 | 144/184 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/184 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 20 | 20 | 0 | 0 | 160/184 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 6 | 6 | 6 | 1 | 51/184 |
| Sim18 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 56/184 |
| Sim19 Wunschtest | Nachtdienst | N | – | 0 | 0 | 0 | 0 | 0/184 |
| Sim20 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 56/184 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 6 | 6 | 6 | 1 | 51/184 |
| Sim22 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 1 | 24/184 |
| Sim23 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 59.5/184 |
| Sim24 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 56/184 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 0 | 0 | 0 | 0 | 0/184 |
| Sim26 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 56/184 |
| Sim27 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 59.5/184 |
| Sim28 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 0 | 24/184 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim33 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 13 | 13 | 0 | 0 | 184/184 |
| Sim34 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 23 | 0 | 0 | 184/184 |
| Sim35 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 23 | 0 | 0 | 184/184 |
| Sim36 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 23 | 0 | 0 | 184/184 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 23 | 0 | 0 | 0 | 184/184 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 18 | 0 | 0 | 0 | 144/184 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 23 | 0 | 0 | 0 | 184/184 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 18 | 0 | 0 | 0 | 144/184 |


## quarter: 2027-01

Konflikte: {"understaffed":72,"target_hours_shortfall":21}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 15 | 15 | 0 | 0 | 168/168 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 1 | 136/168 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 1 | 136/168 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 16 | 16 | 0 | 0 | 168/168 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 2 | 2 | 2 | 1 | 17/168 |
| Sim18 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/168 |
| Sim19 Wunschtest | Nachtdienst | N | – | 0 | 0 | 0 | 0 | 0/168 |
| Sim20 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/168 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 6 | 6 | 6 | 1 | 51/168 |
| Sim22 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 1 | 24/168 |
| Sim23 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 1 | 25.5/168 |
| Sim24 Wunschtest | Nachtdienst | N | – | 6 | 6 | 6 | 2 | 48/168 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 0 | 0 | 0 | 0 | 0/168 |
| Sim26 Wunschtest | Nachtdienst | N | – | 6 | 6 | 6 | 2 | 48/168 |
| Sim27 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 59.5/168 |
| Sim28 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 0 | 24/168 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim33 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim34 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim35 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim36 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/168 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 16 | 0 | 0 | 0 | 128/168 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/168 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 16 | 0 | 0 | 0 | 128/168 |


## quarter: 2027-02

Konflikte: {"understaffed":63,"target_hours_shortfall":30}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 16 | 16 | 0 | 0 | 128/160 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 16 | 16 | 0 | 0 | 128/160 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 16 | 16 | 0 | 0 | 128/160 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 16 | 16 | 0 | 0 | 128/160 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 16 | 16 | 0 | 0 | 128/160 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 15 | 15 | 0 | 0 | 160/160 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 15 | 15 | 0 | 0 | 120/160 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 15 | 15 | 0 | 0 | 120/160 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 14 | 14 | 0 | 0 | 112/160 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 19 | 19 | 0 | 0 | 152/160 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 10 | 10 | 0 | 0 | 80/160 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 15 | 15 | 0 | 0 | 120/160 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 10 | 10 | 0 | 0 | 80/160 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 6 | 6 | 6 | 1 | 51/160 |
| Sim18 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/160 |
| Sim19 Wunschtest | Nachtdienst | N | – | 0 | 0 | 0 | 0 | 0/160 |
| Sim20 Wunschtest | Nachtdienst | N | – | 6 | 6 | 6 | 2 | 48/160 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 6 | 6 | 6 | 1 | 115/160 |
| Sim22 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 1 | 24/160 |
| Sim23 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 59.5/160 |
| Sim24 Wunschtest | Nachtdienst | N | – | 6 | 6 | 6 | 2 | 48/160 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 0 | 0 | 0 | 0 | 0/160 |
| Sim26 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/160 |
| Sim27 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 59.5/160 |
| Sim28 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 0 | 24/160 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim33 Wunschtest | Monatlicher Wechsel | L1 | – | 12 | 12 | 0 | 1 | 96/160 |
| Sim34 Wunschtest | Monatlicher Wechsel | L1 | – | 12 | 12 | 0 | 1 | 96/160 |
| Sim35 Wunschtest | Monatlicher Wechsel | L1 | – | 17 | 17 | 0 | 1 | 136/160 |
| Sim36 Wunschtest | Monatlicher Wechsel | L1 | – | 12 | 12 | 0 | 1 | 96/160 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/160 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 16 | 0 | 0 | 0 | 128/160 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/160 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 16 | 0 | 0 | 0 | 128/160 |


## quarter: 2027-03

Konflikte: {"understaffed":68,"target_hours_shortfall":21}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 18 | 18 | 0 | 0 | 144/184 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 18 | 18 | 0 | 0 | 144/184 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 18 | 18 | 0 | 0 | 144/184 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 18 | 18 | 0 | 0 | 144/184 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 18 | 18 | 0 | 0 | 144/184 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/184 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 20 | 20 | 0 | 0 | 160/184 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 6 | 6 | 6 | 1 | 51/184 |
| Sim18 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/184 |
| Sim19 Wunschtest | Nachtdienst | N | – | 0 | 0 | 0 | 0 | 0/184 |
| Sim20 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 0 | 56/184 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 6 | 6 | 6 | 1 | 51/184 |
| Sim22 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 0 | 24/184 |
| Sim23 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 59.5/184 |
| Sim24 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 2 | 56/184 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 0 | 0 | 0 | 0 | 0/184 |
| Sim26 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 56/184 |
| Sim27 Wunschtest | Nachtdienst | N | – | 7 | 7 | 7 | 1 | 59.5/184 |
| Sim28 Wunschtest | Nachtdienst | N | – | 3 | 3 | 3 | 1 | 24/184 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim33 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 13 | 13 | 0 | 0 | 184/184 |
| Sim34 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 23 | 0 | 0 | 184/184 |
| Sim35 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 23 | 0 | 0 | 184/184 |
| Sim36 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 23 | 0 | 0 | 184/184 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 23 | 0 | 0 | 0 | 184/184 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 18 | 0 | 0 | 0 | 144/184 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 23 | 0 | 0 | 0 | 184/184 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 18 | 0 | 0 | 0 | 144/184 |


## stress: 2027-01

Konflikte: {"understaffed":102,"target_hours_shortfall":13}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 15 | 15 | 0 | 0 | 168/168 |
| Sim02 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 1 | 136/168 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim04 Wunschtest | Frühdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 1 | 136/168 |
| Sim06 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim08 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim09 Wunschtest | Spätdienst | E1 | 6, 0 | 16 | 16 | 0 | 0 | 168/168 |
| Sim10 Wunschtest | Spätdienst | E1 | 0 | 21 | 21 | 0 | 1 | 168/168 |
| Sim11 Wunschtest | Spätdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim12 Wunschtest | Spätdienst | E1 | 0 | 21 | 21 | 0 | 1 | 168/168 |
| Sim13 Wunschtest | Spätdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim14 Wunschtest | Spätdienst | E1 | 0 | 21 | 21 | 0 | 1 | 168/168 |
| Sim15 Wunschtest | Spätdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim16 Wunschtest | Spätdienst | E1 | 0 | 21 | 21 | 0 | 1 | 168/168 |
| Sim17 Wunschtest | Nachtdienst | E1 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim18 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 0 | 168/168 |
| Sim19 Wunschtest | Nachtdienst | E1 | – | 20 | 20 | 0 | 0 | 160/168 |
| Sim20 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim21 Wunschtest | Nachtdienst | E1 | 0 | 21 | 21 | 0 | 1 | 168/168 |
| Sim22 Wunschtest | Nachtdienst | E1 | – | 20 | 20 | 0 | 1 | 160/168 |
| Sim23 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim24 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim25 Wunschtest | Nachtdienst | E1 | 0 | 20 | 20 | 0 | 1 | 160/168 |
| Sim26 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim27 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim28 Wunschtest | Nachtdienst | E1 | – | 20 | 20 | 0 | 1 | 160/168 |
| Sim29 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim30 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim31 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim32 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim33 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim34 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim35 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim36 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 0 | 168/168 |
| Sim37 Wunschtest | Flexibel mit Limits | E1 | 0 | 20 | 20 | 0 | 0 | 160/168 |
| Sim38 Wunschtest | Flexibel mit Limits | E1 | 2 | 16 | 16 | 0 | 0 | 128/168 |
| Sim39 Wunschtest | Flexibel mit Limits | E1 | 0 | 20 | 20 | 0 | 0 | 160/168 |
| Sim40 Wunschtest | Flexibel mit Limits | E1 | 2 | 16 | 16 | 0 | 0 | 128/168 |


## stress: 2027-01

Standardgewicht 50%; Wünsche bleiben verbindlich

Konflikte: {"understaffed":102,"target_hours_shortfall":13}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 15 | 15 | 0 | 0 | 168/168 |
| Sim02 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 1 | 136/168 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim04 Wunschtest | Frühdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 1 | 136/168 |
| Sim06 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim08 Wunschtest | Frühdienst | E1 | 3 | 17 | 17 | 0 | 0 | 136/168 |
| Sim09 Wunschtest | Spätdienst | E1 | 6, 0 | 16 | 16 | 0 | 0 | 168/168 |
| Sim10 Wunschtest | Spätdienst | E1 | 0 | 21 | 21 | 0 | 1 | 168/168 |
| Sim11 Wunschtest | Spätdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim12 Wunschtest | Spätdienst | E1 | 0 | 21 | 21 | 0 | 1 | 168/168 |
| Sim13 Wunschtest | Spätdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim14 Wunschtest | Spätdienst | E1 | 0 | 21 | 21 | 0 | 1 | 168/168 |
| Sim15 Wunschtest | Spätdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim16 Wunschtest | Spätdienst | E1 | 0 | 21 | 21 | 0 | 1 | 168/168 |
| Sim17 Wunschtest | Nachtdienst | E1 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim18 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 0 | 168/168 |
| Sim19 Wunschtest | Nachtdienst | E1 | – | 20 | 20 | 0 | 0 | 160/168 |
| Sim20 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim21 Wunschtest | Nachtdienst | E1 | 0 | 21 | 21 | 0 | 1 | 168/168 |
| Sim22 Wunschtest | Nachtdienst | E1 | – | 20 | 20 | 0 | 1 | 160/168 |
| Sim23 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim24 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim25 Wunschtest | Nachtdienst | E1 | 0 | 20 | 20 | 0 | 1 | 160/168 |
| Sim26 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim27 Wunschtest | Nachtdienst | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim28 Wunschtest | Nachtdienst | E1 | – | 20 | 20 | 0 | 1 | 160/168 |
| Sim29 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim30 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim31 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim32 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim33 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim34 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim35 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim36 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 0 | 168/168 |
| Sim37 Wunschtest | Flexibel mit Limits | E1 | 0 | 20 | 20 | 0 | 0 | 160/168 |
| Sim38 Wunschtest | Flexibel mit Limits | E1 | 2 | 16 | 16 | 0 | 0 | 128/168 |
| Sim39 Wunschtest | Flexibel mit Limits | E1 | 0 | 20 | 20 | 0 | 0 | 160/168 |
| Sim40 Wunschtest | Flexibel mit Limits | E1 | 2 | 16 | 16 | 0 | 0 | 128/168 |
