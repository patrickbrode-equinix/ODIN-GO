# Nachtmodell-Simulation mit 40 Fantasiemitarbeitern

**Planungsmonat:** Dezember 2031 (Monatsbeginn: Montag)  
**Durchlauf:** echter Generator gegen die lokale Testdatenbank  
**Bereinigung:** alle 40 Testnutzer, Quellen-Schichten und Monatsziele wurden nach dem Lauf entfernt.

## Testaufbau

- 8 Mitarbeiter mit `SEVEN_DAY`, Nacht bevorzugt, maximal sieben Naechte.
- 16 Mitarbeiter mit `SHORT`, Nacht bevorzugt; ein Teil mit gesperrtem Sonntag.
- 8 Mitarbeiter mit harter Nacht-Abwahl `N` und teilweise gesperrtem Wochenende.
- 8 Mitarbeiter mit Tagesdienst-Praeferenzen und harter Nacht-Abwahl `N`.
- Nachtdefinition waehrend des isolierten Laufs: `min_staff = 3`, `max_staff = 3`.
- Individuelles Monatsziel: 40 Stunden, damit die Nachtmodell- und Kapazitaetsregeln statt kuenstlicher Sollstunden-Konflikte bewertet werden.

## Ergebnis Nachtplanung

| Pruefung | Ergebnis |
|---|---:|
| Testmitarbeiter | 40 |
| Geplante Nachtzuweisungen | 93 |
| Erforderliche Nachtzuweisungen | 93 |
| Tage mit exakt 3 Nachtmitarbeitern | 31 / 31 |
| Nacht-Ueberbesetzungen | 0 |
| Nacht-Unterbesetzungen | 0 |
| Verstoss gegen harte N-Abwahl | 0 |
| SHORT-Bloecke ueber 3 Naechte | 0 |
| Sollstunden-Konflikte der Testpersonen | 0 |

## Beobachtungen

- Ein `SEVEN_DAY`-Mitarbeiter erhielt einen vollstaendigen Block vom 22. bis 28. Dezember.
- Ein weiterer `SEVEN_DAY`-Mitarbeiter begann am 29. Dezember einen Block. Im Dezember erscheinen daher nur drei Naechte; die verbleibenden Tage werden ueber den vorhandenen Serienstatus in die Januarplanung getragen. Das ist eine korrekte Monatsgrenze, kein gekuerzter Block.
- SHORT-Mitarbeiter erhielten ausschliesslich Bloecke mit ein bis drei Naechten, zum Beispiel 1.-3., 4.-6. oder 24.-26. Dezember.
- Kein Mitarbeiter mit abgewählter Nachtschicht erhielt `N`.
- Die harte `max_staff`-Grenze wurde bei jeder Nacht eingehalten.

## Weitere Generatorbefunde

Der Generator meldete ausserhalb der Nachtplanung wiederkehrende Unterbesetzung fuer eine konfigurierte Schichtart `special` sowie einzelne Frueh-/Spaettermine. Das ist kein Nachtmodellfehler: In der lokalen Konfiguration existiert eine Mindestbesetzung fuer `special`, aber im Test keine passende planbare Besetzung bzw. kein Pool. Diese Definition sollte in den Admin-Einstellungen geprueft werden.

## Fazit

Der Mischbetrieb aus `SEVEN_DAY` und `SHORT` funktioniert im echten Generatorlauf. Die Nacht-Coverage wurde vollstaendig erreicht, ohne die neue harte Kapazitaetsgrenze, die Nacht-Abwahl oder das Drei-Nacht-Limit zu verletzen.
