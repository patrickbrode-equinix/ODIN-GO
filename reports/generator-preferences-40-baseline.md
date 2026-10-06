# Generatorprüfung mit 40 Mitarbeitern

Lauf: baseline. Echte PostgreSQL-Testdatenbank; bestehende Datenbank unverändert.

40 gespeicherte Mitarbeiterprofile, drei Monatsläufe, Q1 2027 mit Monatsübergängen und ein absichtlich unlösbarer Präferenzfall.

| Lauf | Monat | Zuweisungen | Mitarbeiter mit Diensten | Wunschverletzungen |
|---|---|---:|---:|---:|
| monthly | 2027-01 | 826 | 40/40 | 252 |
| monthly | 2027-02 | 782 | 40/40 | 302 |
| monthly | 2027-03 | 897 | 40/40 | 291 |
| quarter | 2027-01 | 826 | 40/40 | 252 |
| quarter | 2027-02 | 783 | 40/40 | 292 |
| quarter | 2027-03 | 888 | 40/40 | 284 |
| stress | 2027-01 | 827 | 40/40 | 424 |

Gesamte Wunschverletzungen: **2097**

## Grenzen

Wünsche haben Vorrang vor Sollstunden und Besetzungszielen. Ruhezeiten und Abwesenheiten gelten zusätzlich. Unlösbare Wünsche führen zu offenen Diensten bzw. ausgewiesenen Sollstunden-Konflikten, nicht zur Garantie vollständiger Besetzung.

## monthly: 2027-01

Konflikte: {"understaffed":71,"target_hours_shortfall":3}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 15 | 15 | 0 | 0 | 168/168 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 21 | 21 | 0 | 0 | 168/168 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 21 | 21 | 0 | 1 | 168/168 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 21 | 21 | 0 | 1 | 168/168 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 21 | 21 | 0 | 0 | 168/168 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 21 | 21 | 0 | 0 | 168/168 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 16 | 16 | 0 | 0 | 168/168 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 21 | 20 | 0 | 0 | 168/168 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 22 | 15 | 0 | 1 | 176/168 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 21 | 3 | 3 | 2 | 169.5/168 |
| Sim18 Wunschtest | Nachtdienst | N | – | 21 | 6 | 6 | 3 | 168/168 |
| Sim19 Wunschtest | Nachtdienst | N | – | 21 | 0 | 0 | 0 | 168/168 |
| Sim20 Wunschtest | Nachtdienst | N | – | 19 | 7 | 7 | 2 | 152/168 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 21 | 7 | 7 | 2 | 171.5/168 |
| Sim22 Wunschtest | Nachtdienst | N | – | 21 | 3 | 3 | 1 | 168/168 |
| Sim23 Wunschtest | Nachtdienst | N | – | 21 | 3 | 3 | 2 | 169.5/168 |
| Sim24 Wunschtest | Nachtdienst | N | – | 21 | 6 | 6 | 3 | 168/168 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 21 | 0 | 0 | 0 | 168/168 |
| Sim26 Wunschtest | Nachtdienst | N | – | 22 | 6 | 6 | 3 | 176/168 |
| Sim27 Wunschtest | Nachtdienst | N | – | 20 | 7 | 7 | 1 | 163.5/168 |
| Sim28 Wunschtest | Nachtdienst | N | – | 19 | 3 | 3 | 0 | 152/168 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 20 | 0 | 0 | 168/168 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 16 | 0 | 0 | 168/168 |
| Sim33 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim34 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim35 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim36 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 21 | 0 | 0 | 0 | 168/168 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 21 | 0 | 0 | 1 | 168/168 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 21 | 0 | 0 | 0 | 168/168 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 21 | 0 | 0 | 1 | 168/168 |

- Sim02 Wunschtest, Tag 6, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 13, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 20, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 27, E2: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 6, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 13, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 20, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 27, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 6, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 13, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 20, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 27, E1: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 6, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 13, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 20, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 27, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 6, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 13, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 20, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 27, E2: Gesperrter Wochentag
- Sim10 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 25, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 26, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 27, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 28, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 29, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 30, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 31, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 31, L1WE: Gesperrter Wochentag
- Sim17 Wunschtest, Tag 3, N: Gesperrter Wochentag
- Sim17 Wunschtest, Tag 7, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 8, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 13, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 14, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 15, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 18, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 19, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 20, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 21, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 22, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 25, E1SA: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 26, E1SA: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 27, E1SA: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 28, E1SA: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 29, E1SA: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 30, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 13, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 14, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 15, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 18, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 19, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 20, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 21, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 22, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 25, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 26, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 27, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 28, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 29, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 30, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag –, : Wochenendlimit 3/2
- Sim19 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 1, E1: Gewünschter freier Feiertag
- Sim19 Wunschtest, Tag 4, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 5, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 6, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 7, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 8, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 13, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 14, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 15, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 18, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 19, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 20, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 21, E1: Außerhalb der bevorzugten Schichten

## monthly: 2027-02

Konflikte: {"understaffed":65,"target_hours_shortfall":5}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 20 | 20 | 0 | 0 | 160/160 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 20 | 20 | 0 | 1 | 160/160 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 20 | 20 | 0 | 1 | 160/160 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 20 | 15 | 0 | 0 | 160/160 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 20 | 15 | 0 | 0 | 160/160 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 15 | 15 | 0 | 0 | 160/160 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 20 | 10 | 0 | 1 | 160/160 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 20 | 0 | 0 | 2 | 160/160 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 20 | 12 | 0 | 1 | 160/160 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 20 | 10 | 0 | 1 | 160/160 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 20 | 5 | 0 | 1 | 160/160 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 20 | 7 | 7 | 2 | 163.5/160 |
| Sim18 Wunschtest | Nachtdienst | N | – | 19 | 7 | 7 | 2 | 152/160 |
| Sim19 Wunschtest | Nachtdienst | N | – | 20 | 0 | 0 | 0 | 160/160 |
| Sim20 Wunschtest | Nachtdienst | N | – | 19 | 7 | 7 | 2 | 152/160 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 12 | 2 | 2 | 0 | 161/160 |
| Sim22 Wunschtest | Nachtdienst | N | – | 20 | 3 | 3 | 2 | 160/160 |
| Sim23 Wunschtest | Nachtdienst | N | – | 19 | 7 | 7 | 1 | 155.5/160 |
| Sim24 Wunschtest | Nachtdienst | N | – | 19 | 7 | 7 | 2 | 152/160 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 20 | 0 | 0 | 0 | 160/160 |
| Sim26 Wunschtest | Nachtdienst | N | – | 20 | 7 | 7 | 2 | 160/160 |
| Sim27 Wunschtest | Nachtdienst | N | – | 19 | 7 | 7 | 1 | 155.5/160 |
| Sim28 Wunschtest | Nachtdienst | N | – | 20 | 3 | 3 | 1 | 160/160 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim33 Wunschtest | Monatlicher Wechsel | L1 | – | 20 | 12 | 0 | 1 | 160/160 |
| Sim34 Wunschtest | Monatlicher Wechsel | L1 | – | 20 | 12 | 0 | 1 | 160/160 |
| Sim35 Wunschtest | Monatlicher Wechsel | L1 | – | 20 | 17 | 0 | 1 | 160/160 |
| Sim36 Wunschtest | Monatlicher Wechsel | L1 | – | 20 | 17 | 0 | 1 | 160/160 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/160 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 20 | 0 | 0 | 1 | 160/160 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/160 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 20 | 0 | 0 | 1 | 160/160 |

- Sim02 Wunschtest, Tag 3, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 3, E1WE: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 10, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 17, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 24, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 3, E1WE: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 10, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 17, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 24, E1: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 3, E1: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 4, E1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 5, E1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim08 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim08 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim08 Wunschtest, Tag 3, E1: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 4, E1: Außerhalb der bevorzugten Schichten
- Sim08 Wunschtest, Tag 5, E1: Außerhalb der bevorzugten Schichten
- Sim08 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim10 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 22, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 23, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 24, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 25, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 26, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 27, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 28, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 28, L1WE: Gesperrter Wochentag
- Sim12 Wunschtest, Tag 1, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 2, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 3, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 4, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 5, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 6, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 7, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 7, L1WE: Gesperrter Wochentag
- Sim12 Wunschtest, Tag 10, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 15, E2: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 16, E2: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 17, E2: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 18, E2: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 19, E2: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 22, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 23, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 24, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 25, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 26, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 27, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 28, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 28, L1WE: Gesperrter Wochentag
- Sim12 Wunschtest, Tag –, : Wochenendlimit 2/1
- Sim13 Wunschtest, Tag 1, E2: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 2, E2: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 3, E2: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 4, E2: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 5, E2: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 20, L1WE: Gesperrter Wochentag
- Sim13 Wunschtest, Tag 21, L1WE: Gesperrter Wochentag
- Sim13 Wunschtest, Tag 24, E1: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 25, E1: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 26, E1: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag –, : Wochenendlimit 1/0
- Sim14 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 22, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 23, L1WE: Außerhalb der bevorzugten Schichten

## monthly: 2027-03

Konflikte: {"understaffed":72,"target_hours_shortfall":9}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 23 | 23 | 0 | 0 | 184/184 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 23 | 23 | 0 | 1 | 184/184 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 23 | 23 | 0 | 1 | 184/184 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 23 | 18 | 0 | 0 | 184/184 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 23 | 23 | 0 | 0 | 184/184 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 23 | 15 | 0 | 1 | 184/184 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 18 | 0 | 0 | 184/184 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 23 | 15 | 0 | 0 | 184/184 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 18 | 0 | 0 | 184/184 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 23 | 18 | 0 | 0 | 184/184 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 22 | 7 | 7 | 1 | 179.5/184 |
| Sim18 Wunschtest | Nachtdienst | N | – | 21 | 6 | 6 | 1 | 168/184 |
| Sim19 Wunschtest | Nachtdienst | N | – | 23 | 0 | 0 | 0 | 184/184 |
| Sim20 Wunschtest | Nachtdienst | N | – | 21 | 6 | 6 | 1 | 168/184 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 22 | 7 | 7 | 1 | 179.5/184 |
| Sim22 Wunschtest | Nachtdienst | N | – | 23 | 3 | 3 | 1 | 184/184 |
| Sim23 Wunschtest | Nachtdienst | N | – | 22 | 7 | 7 | 1 | 179.5/184 |
| Sim24 Wunschtest | Nachtdienst | N | – | 22 | 7 | 7 | 2 | 176/184 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 23 | 0 | 0 | 0 | 184/184 |
| Sim26 Wunschtest | Nachtdienst | N | – | 21 | 6 | 6 | 1 | 168/184 |
| Sim27 Wunschtest | Nachtdienst | N | – | 22 | 7 | 7 | 1 | 179.5/184 |
| Sim28 Wunschtest | Nachtdienst | N | – | 21 | 3 | 3 | 0 | 168/184 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 18 | 0 | 0 | 184/184 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim33 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 13 | 13 | 0 | 0 | 184/184 |
| Sim34 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 23 | 0 | 0 | 184/184 |
| Sim35 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 18 | 0 | 0 | 184/184 |
| Sim36 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 18 | 0 | 0 | 184/184 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 23 | 0 | 0 | 0 | 184/184 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 23 | 0 | 0 | 1 | 184/184 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 23 | 0 | 0 | 0 | 184/184 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 23 | 0 | 0 | 1 | 184/184 |

- Sim02 Wunschtest, Tag 3, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 31, E2: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 3, E1WE: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 10, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 17, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 24, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 31, E1WE: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 3, E1WE: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 10, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 17, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 24, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 31, E1WE: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 1, L1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 2, L1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 3, L1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 3, L1: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 4, L1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 5, L1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 31, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 3, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 31, E2: Gesperrter Wochentag
- Sim12 Wunschtest, Tag 22, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 23, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 24, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 25, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 26, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 27, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 28, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 28, L1WE: Gesperrter Wochentag
- Sim12 Wunschtest, Tag 31, E1: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 4, E1: Außerhalb der bevorzugten Schichten
- Sim13 Wunschtest, Tag 5, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 8, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 9, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 10, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 29, L1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 30, L1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 31, L1: Außerhalb der bevorzugten Schichten
- Sim15 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim15 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim15 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim15 Wunschtest, Tag 4, E1: Außerhalb der bevorzugten Schichten
- Sim15 Wunschtest, Tag 5, E1: Außerhalb der bevorzugten Schichten
- Sim16 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim16 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim16 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim16 Wunschtest, Tag 4, E1: Außerhalb der bevorzugten Schichten
- Sim16 Wunschtest, Tag 5, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 7, N: Gesperrter Wochentag
- Sim17 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 15, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 16, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 17, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 18, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 19, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 22, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 23, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 24, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 25, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 26, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 29, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 30, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 31, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten

## quarter: 2027-01

Konflikte: {"understaffed":71,"target_hours_shortfall":3}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 15 | 15 | 0 | 0 | 168/168 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 21 | 21 | 0 | 0 | 168/168 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 21 | 21 | 0 | 1 | 168/168 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 21 | 21 | 0 | 1 | 168/168 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 21 | 21 | 0 | 0 | 168/168 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 21 | 21 | 0 | 0 | 168/168 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 16 | 16 | 0 | 0 | 168/168 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 21 | 20 | 0 | 0 | 168/168 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 22 | 15 | 0 | 1 | 176/168 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 21 | 3 | 3 | 2 | 169.5/168 |
| Sim18 Wunschtest | Nachtdienst | N | – | 21 | 6 | 6 | 3 | 168/168 |
| Sim19 Wunschtest | Nachtdienst | N | – | 21 | 0 | 0 | 0 | 168/168 |
| Sim20 Wunschtest | Nachtdienst | N | – | 19 | 7 | 7 | 2 | 152/168 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 21 | 7 | 7 | 2 | 171.5/168 |
| Sim22 Wunschtest | Nachtdienst | N | – | 21 | 3 | 3 | 1 | 168/168 |
| Sim23 Wunschtest | Nachtdienst | N | – | 21 | 3 | 3 | 2 | 169.5/168 |
| Sim24 Wunschtest | Nachtdienst | N | – | 21 | 6 | 6 | 3 | 168/168 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 21 | 0 | 0 | 0 | 168/168 |
| Sim26 Wunschtest | Nachtdienst | N | – | 22 | 6 | 6 | 3 | 176/168 |
| Sim27 Wunschtest | Nachtdienst | N | – | 20 | 7 | 7 | 1 | 163.5/168 |
| Sim28 Wunschtest | Nachtdienst | N | – | 19 | 3 | 3 | 0 | 152/168 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 20 | 0 | 0 | 168/168 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 21 | 0 | 0 | 168/168 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 21 | 16 | 0 | 0 | 168/168 |
| Sim33 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim34 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim35 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim36 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 21 | 0 | 0 | 0 | 168/168 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 21 | 0 | 0 | 1 | 168/168 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 21 | 0 | 0 | 0 | 168/168 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 21 | 0 | 0 | 1 | 168/168 |

- Sim02 Wunschtest, Tag 6, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 13, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 20, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 27, E2: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 6, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 13, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 20, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 27, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 6, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 13, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 20, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 27, E1: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 6, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 13, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 20, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 27, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 6, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 13, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 20, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 27, E2: Gesperrter Wochentag
- Sim10 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 25, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 26, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 27, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 28, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 29, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 30, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 31, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 31, L1WE: Gesperrter Wochentag
- Sim17 Wunschtest, Tag 3, N: Gesperrter Wochentag
- Sim17 Wunschtest, Tag 7, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 8, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 13, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 14, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 15, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 18, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 19, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 20, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 21, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 22, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 25, E1SA: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 26, E1SA: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 27, E1SA: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 28, E1SA: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 29, E1SA: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 30, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 13, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 14, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 15, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 18, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 19, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 20, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 21, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 22, E1: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 25, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 26, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 27, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 28, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 29, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag 30, E1SA: Außerhalb der bevorzugten Schichten
- Sim18 Wunschtest, Tag –, : Wochenendlimit 3/2
- Sim19 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 1, E1: Gewünschter freier Feiertag
- Sim19 Wunschtest, Tag 4, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 5, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 6, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 7, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 8, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 13, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 14, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 15, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 18, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 19, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 20, E1: Außerhalb der bevorzugten Schichten
- Sim19 Wunschtest, Tag 21, E1: Außerhalb der bevorzugten Schichten

## quarter: 2027-02

Konflikte: {"understaffed":60,"target_hours_shortfall":3}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 20 | 20 | 0 | 0 | 160/160 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 20 | 20 | 0 | 1 | 160/160 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 20 | 15 | 0 | 0 | 160/160 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 20 | 20 | 0 | 1 | 160/160 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 20 | 20 | 0 | 0 | 160/160 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 20 | 20 | 0 | 0 | 160/160 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 15 | 15 | 0 | 0 | 160/160 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 20 | 7 | 0 | 1 | 160/160 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 20 | 0 | 0 | 1 | 160/160 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 20 | 5 | 0 | 1 | 160/160 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 20 | 17 | 0 | 1 | 160/160 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 20 | 10 | 0 | 1 | 160/160 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 20 | 7 | 7 | 2 | 163.5/160 |
| Sim18 Wunschtest | Nachtdienst | N | – | 19 | 7 | 7 | 2 | 152/160 |
| Sim19 Wunschtest | Nachtdienst | N | – | 20 | 0 | 0 | 0 | 160/160 |
| Sim20 Wunschtest | Nachtdienst | N | – | 18 | 7 | 7 | 2 | 144/160 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 12 | 7 | 7 | 1 | 163.5/160 |
| Sim22 Wunschtest | Nachtdienst | N | – | 20 | 3 | 3 | 2 | 160/160 |
| Sim23 Wunschtest | Nachtdienst | N | – | 20 | 7 | 7 | 2 | 163.5/160 |
| Sim24 Wunschtest | Nachtdienst | N | – | 18 | 7 | 7 | 2 | 144/160 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 20 | 0 | 0 | 0 | 160/160 |
| Sim26 Wunschtest | Nachtdienst | N | – | 20 | 7 | 7 | 2 | 160/160 |
| Sim27 Wunschtest | Nachtdienst | N | – | 21 | 7 | 7 | 2 | 171.5/160 |
| Sim28 Wunschtest | Nachtdienst | N | – | 20 | 3 | 3 | 1 | 160/160 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 20 | 20 | 0 | 0 | 160/160 |
| Sim33 Wunschtest | Monatlicher Wechsel | L1 | – | 20 | 12 | 0 | 1 | 160/160 |
| Sim34 Wunschtest | Monatlicher Wechsel | L1 | – | 20 | 12 | 0 | 1 | 160/160 |
| Sim35 Wunschtest | Monatlicher Wechsel | L1 | – | 20 | 17 | 0 | 1 | 160/160 |
| Sim36 Wunschtest | Monatlicher Wechsel | L1 | – | 20 | 17 | 0 | 1 | 160/160 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/160 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 20 | 0 | 0 | 1 | 160/160 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 20 | 0 | 0 | 0 | 160/160 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 20 | 0 | 0 | 1 | 160/160 |

- Sim02 Wunschtest, Tag 3, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 3, E1WE: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 10, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 17, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 24, E1: Gesperrter Wochentag
- Sim04 Wunschtest, Tag 8, E1: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 9, E1: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 10, E1: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim05 Wunschtest, Tag 3, E1WE: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 10, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 17, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 24, E1: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 3, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 3, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim11 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 8, E1: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 9, E1: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 10, E1: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 15, E2: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 16, E2: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 17, E2: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 18, E2: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 19, E2: Außerhalb der bevorzugten Schichten
- Sim11 Wunschtest, Tag 27, L1WE: Gesperrter Wochentag
- Sim11 Wunschtest, Tag 28, L1WE: Gesperrter Wochentag
- Sim11 Wunschtest, Tag –, : Wochenendlimit 1/0
- Sim12 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 8, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 9, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 10, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 15, E2: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 16, E2: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 17, E2: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 18, E2: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 19, E2: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 22, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 23, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 24, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 25, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 26, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 27, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 28, L1WE: Außerhalb der bevorzugten Schichten
- Sim12 Wunschtest, Tag 28, L1WE: Gesperrter Wochentag
- Sim14 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 8, L1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 9, L1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 10, L1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 11, L1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 12, L1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 22, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 23, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 24, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 25, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 26, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 27, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 28, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 28, L1WE: Gesperrter Wochentag
- Sim15 Wunschtest, Tag 20, L1WE: Gesperrter Wochentag
- Sim15 Wunschtest, Tag 21, L1WE: Gesperrter Wochentag

## quarter: 2027-03

Konflikte: {"understaffed":68,"target_hours_shortfall":10}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim02 Wunschtest | Frühdienst | E2 | 3 | 23 | 23 | 0 | 0 | 184/184 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 23 | 23 | 0 | 1 | 184/184 |
| Sim04 Wunschtest | Frühdienst | E2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 23 | 23 | 0 | 1 | 184/184 |
| Sim06 Wunschtest | Frühdienst | E2 | 3 | 23 | 18 | 0 | 0 | 184/184 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim08 Wunschtest | Frühdienst | E2 | 3 | 23 | 23 | 0 | 0 | 184/184 |
| Sim09 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim10 Wunschtest | Spätdienst | L2 | 0 | 23 | 10 | 0 | 1 | 184/184 |
| Sim11 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim12 Wunschtest | Spätdienst | L2 | 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim13 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim14 Wunschtest | Spätdienst | L2 | 0 | 23 | 10 | 0 | 1 | 184/184 |
| Sim15 Wunschtest | Spätdienst | L1 | 6, 0 | 23 | 18 | 0 | 0 | 184/184 |
| Sim16 Wunschtest | Spätdienst | L2 | 0 | 23 | 18 | 0 | 0 | 184/184 |
| Sim17 Wunschtest | Nachtdienst | N | 0 | 22 | 7 | 7 | 1 | 179.5/184 |
| Sim18 Wunschtest | Nachtdienst | N | – | 20 | 6 | 6 | 1 | 160/184 |
| Sim19 Wunschtest | Nachtdienst | N | – | 23 | 0 | 0 | 0 | 184/184 |
| Sim20 Wunschtest | Nachtdienst | N | – | 19 | 6 | 6 | 1 | 152/184 |
| Sim21 Wunschtest | Nachtdienst | N | 0 | 22 | 7 | 7 | 1 | 179.5/184 |
| Sim22 Wunschtest | Nachtdienst | N | – | 21 | 3 | 3 | 0 | 168/184 |
| Sim23 Wunschtest | Nachtdienst | N | – | 22 | 7 | 7 | 1 | 179.5/184 |
| Sim24 Wunschtest | Nachtdienst | N | – | 20 | 6 | 6 | 2 | 160/184 |
| Sim25 Wunschtest | Nachtdienst | N | 0 | 23 | 0 | 0 | 0 | 184/184 |
| Sim26 Wunschtest | Nachtdienst | N | – | 19 | 6 | 6 | 1 | 152/184 |
| Sim27 Wunschtest | Nachtdienst | N | – | 22 | 7 | 7 | 1 | 179.5/184 |
| Sim28 Wunschtest | Nachtdienst | N | – | 21 | 3 | 3 | 1 | 168/184 |
| Sim29 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim30 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim31 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim32 Wunschtest | Früh/Spät gemischt | E2, L2 | 6, 0 | 23 | 23 | 0 | 0 | 184/184 |
| Sim33 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 13 | 13 | 0 | 0 | 184/184 |
| Sim34 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 23 | 0 | 0 | 184/184 |
| Sim35 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 18 | 0 | 0 | 184/184 |
| Sim36 Wunschtest | Monatlicher Wechsel | E2, L2 | – | 23 | 18 | 0 | 0 | 184/184 |
| Sim37 Wunschtest | Flexibel mit Limits | flexibel | 0 | 23 | 0 | 0 | 0 | 184/184 |
| Sim38 Wunschtest | Flexibel mit Limits | flexibel | 2 | 23 | 0 | 0 | 1 | 184/184 |
| Sim39 Wunschtest | Flexibel mit Limits | flexibel | 0 | 23 | 0 | 0 | 0 | 184/184 |
| Sim40 Wunschtest | Flexibel mit Limits | flexibel | 2 | 23 | 0 | 0 | 1 | 184/184 |

- Sim02 Wunschtest, Tag 3, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 31, E2: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 3, E1WE: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 10, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 17, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 24, E1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 31, E1WE: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 3, E1WE: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 10, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 17, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 24, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 31, E1WE: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 3, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 8, E1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 9, E1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 10, E1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 10, E1: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 31, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 3, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 10, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 17, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 24, E2: Gesperrter Wochentag
- Sim08 Wunschtest, Tag 31, E2: Gesperrter Wochentag
- Sim10 Wunschtest, Tag 1, L1: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 2, L1: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 3, L1: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 4, L1: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 5, L1: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 22, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 23, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 24, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 25, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 26, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 27, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 28, L1WE: Außerhalb der bevorzugten Schichten
- Sim10 Wunschtest, Tag 28, L1WE: Gesperrter Wochentag
- Sim10 Wunschtest, Tag 31, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 4, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 5, E1: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 22, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 23, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 24, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 25, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 26, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 27, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 28, L1WE: Außerhalb der bevorzugten Schichten
- Sim14 Wunschtest, Tag 28, L1WE: Gesperrter Wochentag
- Sim14 Wunschtest, Tag 31, E1: Außerhalb der bevorzugten Schichten
- Sim15 Wunschtest, Tag 1, E1: Außerhalb der bevorzugten Schichten
- Sim15 Wunschtest, Tag 2, E1: Außerhalb der bevorzugten Schichten
- Sim15 Wunschtest, Tag 3, E1: Außerhalb der bevorzugten Schichten
- Sim15 Wunschtest, Tag 4, E1: Außerhalb der bevorzugten Schichten
- Sim15 Wunschtest, Tag 5, E1: Außerhalb der bevorzugten Schichten
- Sim16 Wunschtest, Tag 8, E1: Außerhalb der bevorzugten Schichten
- Sim16 Wunschtest, Tag 9, E1: Außerhalb der bevorzugten Schichten
- Sim16 Wunschtest, Tag 10, E1: Außerhalb der bevorzugten Schichten
- Sim16 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim16 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 7, N: Gesperrter Wochentag
- Sim17 Wunschtest, Tag 11, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 12, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 15, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 16, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 17, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 18, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 19, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 22, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 23, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 24, E1: Außerhalb der bevorzugten Schichten
- Sim17 Wunschtest, Tag 25, E1: Außerhalb der bevorzugten Schichten

## stress: 2027-01

Konflikte: {"understaffed":74,"target_hours_shortfall":2}

| Mitarbeiter | Gruppe | Bevorzugt | Gesperrte Wochentage (0=So) | Dienste | Wunschdienste | Nächte | Wochenendblöcke | Ist/Soll |
|---|---|---|---|---:|---:|---:|---:|---|
| Sim01 Wunschtest | Frühdienst | E1 | 6, 0 | 15 | 0 | 0 | 0 | 168/168 |
| Sim02 Wunschtest | Frühdienst | E1 | 3 | 21 | 16 | 0 | 1 | 168/168 |
| Sim03 Wunschtest | Frühdienst | E1 | 3 | 21 | 7 | 0 | 1 | 168/168 |
| Sim04 Wunschtest | Frühdienst | E1 | 6, 0 | 21 | 5 | 0 | 0 | 168/168 |
| Sim05 Wunschtest | Frühdienst | E1 | 3 | 21 | 16 | 0 | 1 | 168/168 |
| Sim06 Wunschtest | Frühdienst | E1 | 3 | 21 | 20 | 0 | 1 | 168/168 |
| Sim07 Wunschtest | Frühdienst | E1 | 6, 0 | 21 | 16 | 0 | 0 | 168/168 |
| Sim08 Wunschtest | Frühdienst | E1 | 3 | 21 | 10 | 0 | 1 | 168/168 |
| Sim09 Wunschtest | Spätdienst | E1 | 6, 0 | 16 | 0 | 0 | 0 | 168/168 |
| Sim10 Wunschtest | Spätdienst | E1 | 0 | 21 | 2 | 0 | 1 | 168/168 |
| Sim11 Wunschtest | Spätdienst | E1 | 6, 0 | 21 | 0 | 0 | 0 | 168/168 |
| Sim12 Wunschtest | Spätdienst | E1 | 0 | 21 | 20 | 0 | 1 | 168/168 |
| Sim13 Wunschtest | Spätdienst | E1 | 6, 0 | 21 | 11 | 0 | 0 | 168/168 |
| Sim14 Wunschtest | Spätdienst | E1 | 0 | 21 | 7 | 0 | 1 | 168/168 |
| Sim15 Wunschtest | Spätdienst | E1 | 6, 0 | 21 | 5 | 0 | 0 | 168/168 |
| Sim16 Wunschtest | Spätdienst | E1 | 0 | 21 | 0 | 0 | 1 | 168/168 |
| Sim17 Wunschtest | Nachtdienst | E1 | 0 | 21 | 11 | 3 | 3 | 169.5/168 |
| Sim18 Wunschtest | Nachtdienst | E1 | – | 21 | 15 | 6 | 2 | 168/168 |
| Sim19 Wunschtest | Nachtdienst | E1 | – | 21 | 14 | 0 | 2 | 168/168 |
| Sim20 Wunschtest | Nachtdienst | E1 | – | 19 | 12 | 6 | 2 | 152/168 |
| Sim21 Wunschtest | Nachtdienst | E1 | 0 | 21 | 14 | 7 | 3 | 171.5/168 |
| Sim22 Wunschtest | Nachtdienst | E1 | – | 21 | 18 | 3 | 2 | 168/168 |
| Sim23 Wunschtest | Nachtdienst | E1 | – | 21 | 18 | 3 | 3 | 169.5/168 |
| Sim24 Wunschtest | Nachtdienst | E1 | – | 22 | 7 | 6 | 3 | 176/168 |
| Sim25 Wunschtest | Nachtdienst | E1 | 0 | 21 | 14 | 0 | 2 | 168/168 |
| Sim26 Wunschtest | Nachtdienst | E1 | – | 21 | 3 | 6 | 2 | 168/168 |
| Sim27 Wunschtest | Nachtdienst | E1 | – | 20 | 4 | 7 | 2 | 163.5/168 |
| Sim28 Wunschtest | Nachtdienst | E1 | – | 21 | 18 | 3 | 2 | 168/168 |
| Sim29 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 11 | 0 | 0 | 168/168 |
| Sim30 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 6 | 0 | 0 | 168/168 |
| Sim31 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 11 | 0 | 0 | 168/168 |
| Sim32 Wunschtest | Früh/Spät gemischt | E1 | 6, 0 | 21 | 16 | 0 | 0 | 168/168 |
| Sim33 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 13 | 0 | 1 | 168/168 |
| Sim34 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 21 | 0 | 1 | 168/168 |
| Sim35 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 3 | 0 | 1 | 168/168 |
| Sim36 Wunschtest | Monatlicher Wechsel | E1 | – | 21 | 15 | 0 | 1 | 168/168 |
| Sim37 Wunschtest | Flexibel mit Limits | E1 | 0 | 21 | 16 | 0 | 0 | 168/168 |
| Sim38 Wunschtest | Flexibel mit Limits | E1 | 2 | 21 | 21 | 0 | 1 | 168/168 |
| Sim39 Wunschtest | Flexibel mit Limits | E1 | 0 | 21 | 11 | 0 | 0 | 168/168 |
| Sim40 Wunschtest | Flexibel mit Limits | E1 | 2 | 21 | 21 | 0 | 1 | 168/168 |

- Sim01 Wunschtest, Tag 1, L2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 4, E2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 5, E2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 6, E2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 7, E2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 18, L2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 19, L2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 20, L2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 21, L2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 22, L2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 25, L2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 26, L2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 27, L2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 28, L2: Außerhalb der bevorzugten Schichten
- Sim01 Wunschtest, Tag 29, L2: Außerhalb der bevorzugten Schichten
- Sim02 Wunschtest, Tag 6, E1: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 13, E1: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 20, E1: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 25, E2: Außerhalb der bevorzugten Schichten
- Sim02 Wunschtest, Tag 26, E2: Außerhalb der bevorzugten Schichten
- Sim02 Wunschtest, Tag 27, E2: Außerhalb der bevorzugten Schichten
- Sim02 Wunschtest, Tag 27, E2: Gesperrter Wochentag
- Sim02 Wunschtest, Tag 28, E2: Außerhalb der bevorzugten Schichten
- Sim02 Wunschtest, Tag 29, E2: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 6, E1SA: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 12, L2: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 13, L2: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 13, L2: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 14, L2: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 15, L2: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 18, L1: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 19, L1: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 20, L1: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 20, L1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 21, L1: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 22, L1: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 25, L1: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 26, L1: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 27, L1: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 27, L1: Gesperrter Wochentag
- Sim03 Wunschtest, Tag 28, L1: Außerhalb der bevorzugten Schichten
- Sim03 Wunschtest, Tag 29, L1: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 1, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 4, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 5, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 6, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 7, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 8, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 11, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 12, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 13, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 14, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 15, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 18, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 19, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 20, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 21, E2: Außerhalb der bevorzugten Schichten
- Sim04 Wunschtest, Tag 22, E2: Außerhalb der bevorzugten Schichten
- Sim05 Wunschtest, Tag 6, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 13, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 20, E1: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 25, E2: Außerhalb der bevorzugten Schichten
- Sim05 Wunschtest, Tag 26, E2: Außerhalb der bevorzugten Schichten
- Sim05 Wunschtest, Tag 27, E2: Außerhalb der bevorzugten Schichten
- Sim05 Wunschtest, Tag 27, E2: Gesperrter Wochentag
- Sim05 Wunschtest, Tag 28, E2: Außerhalb der bevorzugten Schichten
- Sim05 Wunschtest, Tag 29, E2: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 1, E2: Außerhalb der bevorzugten Schichten
- Sim06 Wunschtest, Tag 6, E1SA: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 13, E1: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 20, E1: Gesperrter Wochentag
- Sim06 Wunschtest, Tag 27, E1: Gesperrter Wochentag
- Sim07 Wunschtest, Tag 18, E2: Außerhalb der bevorzugten Schichten
- Sim07 Wunschtest, Tag 19, E2: Außerhalb der bevorzugten Schichten
- Sim07 Wunschtest, Tag 20, E2: Außerhalb der bevorzugten Schichten
- Sim07 Wunschtest, Tag 21, E2: Außerhalb der bevorzugten Schichten
- Sim07 Wunschtest, Tag 22, E2: Außerhalb der bevorzugten Schichten
- Sim08 Wunschtest, Tag 1, L1: Außerhalb der bevorzugten Schichten
- Sim08 Wunschtest, Tag 4, E2: Außerhalb der bevorzugten Schichten
- Sim08 Wunschtest, Tag 5, E2: Außerhalb der bevorzugten Schichten
