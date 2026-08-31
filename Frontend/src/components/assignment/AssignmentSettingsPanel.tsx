/* ================================================ */
/* ODIN-Logik — Settings Panel                      */
/* Full explanatory tooltips for every setting       */
/* Bilingual: DE / EN                                */
/* ================================================ */

import { useState, useEffect } from 'react';
import { useAssignmentStore } from '../../store/assignmentStore';
import { useLanguage } from '../../context/LanguageContext';
import { Save, RefreshCw } from 'lucide-react';
import { InfoTooltip } from '../ui/InfoTooltip';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import type { AssignmentSettings } from '../../types/assignment';

type Lang = 'de' | 'en';

interface SettingDef {
  key: string & keyof AssignmentSettings;
  label: string;
  type: 'select' | 'boolean' | 'number' | 'text';
  options?: string[];
  tooltip: React.ReactNode;
}

function getSettingDefs(lang: Lang): SettingDef[] {
  const de = lang === 'de';
  return [
    {
      key: 'assignment.mode',
      label: de ? 'Modus' : 'Mode',
      type: 'select',
      options: ['shadow', 'dry-run', 'live'],
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Legt den Betriebsmodus der Assignment Engine fest.</p>
          <p><strong>Shadow:</strong> Die Engine führt den kompletten Zuweisungslauf durch, speichert alle Entscheidungen in der Datenbank — aber ändert <em>keine</em> Ticketzuweisungen im Produktivsystem. Ideal für Validierung und Auditing.</p>
          <p><strong>Dry-Run:</strong> Wie Shadow, aber explizit als einmaliger Testlauf markiert. Wird nicht in reguläre Statistiken einbezogen.</p>
          <p><strong>Live:</strong> Die Engine führt den gesamten Zuweisungsprozess aus und wendet die Ergebnisse <em>produktiv</em> an — Tickets werden tatsächlich zugewiesen. Nur verwenden, wenn die Logik zuvor im Shadow-Modus validiert wurde.</p>
          <p><strong>⚠ Hinweis:</strong> Der Wechsel zu „Live" erfordert zusätzlich die explizite Aktivierung der automatischen Zuweisung über die Steuerleiste oben. Eine versehentliche Produktivzuweisung wird durch eine Sicherheitsabfrage verhindert.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Sets the operating mode of the Assignment Engine.</p>
          <p><strong>Shadow:</strong> The engine runs the full assignment cycle and stores all decisions in the database — but does <em>not</em> modify ticket assignments in the production system. Ideal for validation and auditing.</p>
          <p><strong>Dry-Run:</strong> Like Shadow, but explicitly marked as a one-off test run. Not included in regular statistics.</p>
          <p><strong>Live:</strong> The engine executes the full assignment process and applies results <em>in production</em> — tickets are actually assigned. Only use after validating logic in Shadow mode.</p>
          <p><strong>⚠ Note:</strong> Switching to "Live" additionally requires explicit activation of automatic assignment via the control bar above. An accidental production assignment is prevented by a confirmation dialog.</p>
        </>
      ),
    },
    {
      key: 'assignment.crawlerMaxAgeMinutes',
      label: de ? 'Crawler Max-Alter (Min.)' : 'Crawler Max Age (min)',
      type: 'number',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Legt fest, wie alt die zuletzt eingegangenen Crawler-Daten maximal sein dürfen (in Minuten), bevor die Engine den Lauf abbricht.</p>
          <p><strong>Auswirkung:</strong> Wenn keine frischen Daten vom Jarvis-Crawler vorliegen, arbeitet die Engine potenziell mit veralteten Ticketständen. Diese Schutzregel verhindert Fehlzuweisungen auf Basis veralteter Informationen.</p>
          <p><strong>Zu niedriger Wert:</strong> Die Engine blockiert unnötig oft, weil selbst kurze Crawler-Pausen zum Abbruch führen.</p>
          <p><strong>Zu hoher Wert:</strong> Es besteht das Risiko, dass auf veraltete Ticketdaten entschieden wird, die bereits manuell bearbeitet wurden.</p>
          <p><strong>Empfehlung:</strong> 5–15 Minuten. Standard: 10 Minuten.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Defines the maximum age (in minutes) of the most recent crawler data before the engine aborts the run.</p>
          <p><strong>Effect:</strong> Without fresh data from the Jarvis Crawler, the engine may work with stale ticket states. This safeguard prevents mis-assignments based on outdated information.</p>
          <p><strong>Too low:</strong> The engine blocks too often because even brief crawler pauses cause an abort.</p>
          <p><strong>Too high:</strong> Risk of decisions based on ticket data that have already been manually handled.</p>
          <p><strong>Recommendation:</strong> 5–15 minutes. Default: 10 minutes.</p>
        </>
      ),
    },
    {
      key: 'assignment.siteStrictness',
      label: de ? 'Site-Strenge' : 'Site Strictness',
      type: 'boolean',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Wenn aktiviert, dürfen Tickets nur Mitarbeitern zugewiesen werden, die der gleichen Site (z. B. FR2, FR5) zugeordnet sind wie das Ticket.</p>
          <p><strong>Aktiv:</strong> Strenger Site-Abgleich. Ein Mitarbeiter in FR2 erhält keine Tickets aus FR5. Reduziert die Kandidatenmenge, stellt aber sicher, dass Techniker physisch vor Ort sind.</p>
          <p><strong>Inaktiv:</strong> Tickets können site-übergreifend zugewiesen werden. Sinnvoll bei Unterbesetzung oder wenn Sites personell eng zusammenarbeiten.</p>
          <p><strong>Risiko:</strong> Bei aktiver Site-Strenge und wenigen verfügbaren Mitarbeitern einer Site kann es verstärkt zu „Manual Review"-Entscheidungen kommen.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> When enabled, tickets may only be assigned to workers belonging to the same site (e.g. FR2, FR5) as the ticket.</p>
          <p><strong>Active:</strong> Strict site matching. A worker in FR2 will not receive tickets from FR5. Reduces the candidate pool but ensures technicians are physically on-site.</p>
          <p><strong>Inactive:</strong> Tickets can be assigned across sites. Useful during understaffing or when sites share personnel.</p>
          <p><strong>Risk:</strong> With strict site matching and few available workers at a site, more "Manual Review" decisions may occur.</p>
        </>
      ),
    },
    {
      key: 'assignment.responsibilityStrictness',
      label: de ? 'Verantwortungsbereich-Strenge' : 'Responsibility Strictness',
      type: 'boolean',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Wenn aktiviert, wird geprüft, ob der Verantwortungsbereich (Responsibility) des Mitarbeiters zum Ticket passt.</p>
          <p><strong>Aktiv:</strong> Nur Mitarbeiter mit passendem Zuständigkeitsbereich werden als Kandidaten berücksichtigt. Stellt sicher, dass Tickets an fachlich geeignete Personen gehen.</p>
          <p><strong>Inaktiv:</strong> Der Verantwortungsbereich wird bei der Zuweisung ignoriert. Alle Mitarbeiter aus der passenden Schicht sind grundsätzlich Kandidaten.</p>
          <p><strong>Typische Nutzung:</strong> Im Regelbetrieb aktiviert, wird bei akuter Unterbesetzung gelegentlich deaktiviert.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> When enabled, checks whether the worker's responsibility area matches the ticket.</p>
          <p><strong>Active:</strong> Only workers with a matching responsibility area are considered as candidates. Ensures tickets go to qualified personnel.</p>
          <p><strong>Inactive:</strong> The responsibility area is ignored during assignment. All workers from the matching shift are candidates.</p>
          <p><strong>Typical use:</strong> Enabled during normal operations; occasionally disabled during acute understaffing.</p>
        </>
      ),
    },
    {
      key: 'assignment.enableRotationTieBreaker',
      label: de ? 'Rotation Tie-Breaker' : 'Rotation Tie-Breaker',
      type: 'boolean',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Wenn mehrere Mitarbeiter nach allen Bewertungskriterien vollkommen gleichwertig sind, bestimmt dieser Tie-Breaker, ob eine Rotation stattfindet.</p>
          <p><strong>Aktiv:</strong> Bei Gleichstand wird der Mitarbeiter bevorzugt, der am längsten kein Ticket erhalten hat. Sorgt für fairere Verteilung über die Schicht.</p>
          <p><strong>Inaktiv:</strong> Bei Gleichstand greift der Fallback-Tie-Breaker (z. B. stabile Worker-ID). Es entscheidet dann ein deterministischer, aber nicht rotierender Mechanismus.</p>
          <p><strong>Hinweis:</strong> Die Rotation bezieht sich nur auf den absoluten Gleichstand nach System-Gruppierung, Queue-Reinheit und Auslastung.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> When multiple workers are perfectly equal after all scoring criteria, this tie-breaker determines whether rotation is applied.</p>
          <p><strong>Active:</strong> In a tie, the worker who has gone the longest without receiving a ticket is preferred. Ensures fairer distribution across the shift.</p>
          <p><strong>Inactive:</strong> In a tie, the fallback tie-breaker (e.g. stable worker ID) decides. A deterministic but non-rotating mechanism is used.</p>
          <p><strong>Note:</strong> Rotation only applies to absolute ties after system grouping, queue purity, and workload scoring.</p>
        </>
      ),
    },
    {
      key: 'assignment.fallbackTieBreaker',
      label: de ? 'Fallback Tie-Breaker' : 'Fallback Tie-Breaker',
      type: 'select',
      options: ['stable-id', 'random'],
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Bestimmt den letzten Entscheidungsmechanismus, wenn alle anderen Bewertungskriterien keinen eindeutigen Gewinner ergeben.</p>
          <p><strong>stable-id:</strong> Die niedrigste Worker-ID gewinnt. Dies macht jede Entscheidung exakt reproduzierbar — identische Inputs führen immer zum selben Ergebnis. Ideal für Auditing und Nachvollziehbarkeit.</p>
          <p><strong>random:</strong> Eine zufällige Auswahl unter den Gleichstand-Kandidaten. Kann fairere Verteilung bewirken, erschwert aber die Nachvollziehbarkeit.</p>
          <p><strong>Empfehlung:</strong> „stable-id" für produktive Umgebungen, wenn Auditierbarkeit Priorität hat.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Determines the final decision mechanism when all other scoring criteria produce no clear winner.</p>
          <p><strong>stable-id:</strong> The lowest worker ID wins. This makes every decision exactly reproducible — identical inputs always yield the same result. Ideal for auditing and traceability.</p>
          <p><strong>random:</strong> A random pick among tied candidates. Can improve fairness but reduces traceability.</p>
          <p><strong>Recommendation:</strong> "stable-id" for production environments where auditability is a priority.</p>
        </>
      ),
    },
    {
      key: 'assignment.planningWindowHours',
      label: de ? 'Zuweisungsfenster (Std.)' : 'Assignment Window (hrs)',
      type: 'number',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Legt fest, wie weit in die Zukunft ODIN Tickets für die automatische Verarbeitung betrachtet.</p>
          <p><strong>Referenz:</strong> Bei Scheduled-Tickets wird der geplante Start genutzt, sonst die Commit-/Due-Time.</p>
          <p><strong>Auswirkung:</strong> Tickets außerhalb dieses Fensters bleiben für spätere Läufe liegen und konkurrieren noch nicht mit akuteren Tickets.</p>
          <p><strong>Wenn „Nur aktuelle Schicht" deaktiviert ist:</strong> ODIN lädt zusätzlich zukünftige Planungszeiträume innerhalb dieses Fensters und kann Tickets gezielt an die geplante Folgeschicht vergeben.</p>
          <p><strong>Wenn „Nur aktuelle Schicht" aktiviert ist:</strong> Das Fenster begrenzt weiterhin die Ticket-Relevanz, zugewiesen wird aber nur innerhalb der aktuell aktiven Schichtinstanz.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Defines how far into the future ODIN considers tickets for automatic processing.</p>
          <p><strong>Reference:</strong> For scheduled tickets the planned start is used, otherwise the commit/due time.</p>
          <p><strong>Effect:</strong> Tickets outside this window are deferred to later runs and do not compete with more urgent tickets.</p>
          <p><strong>When "Current Shift Only" is off:</strong> ODIN also loads future planning periods within this window and can assign tickets to the planned next shift.</p>
          <p><strong>When "Current Shift Only" is on:</strong> The window still limits ticket relevance, but assignments are restricted to the currently active shift instance.</p>
        </>
      ),
    },
    {
      key: 'assignment.currentShiftOnly',
      label: de ? 'Nur aktuelle Schicht' : 'Current Shift Only',
      type: 'boolean',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Erzwingt, dass ODIN Tickets nur an Personen in der aktuell aktiven Schichtinstanz vergibt.</p>
          <p><strong>Aktiv:</strong> Zukunftsschichten werden für die tatsächliche Zuweisung ausgeschlossen. Das ist der sichere Standard für operative Sofortverteilung.</p>
          <p><strong>Inaktiv:</strong> Scheduled-Tickets dürfen innerhalb des konfigurierten Zuweisungsfensters bereits an die geplante spätere Schicht vergeben werden, sofern die Wochenplanung diese Schicht kennt.</p>
          <p><strong>Empfehlung:</strong> Im normalen Dispatch-Betrieb aktiviert lassen. Nur deaktivieren, wenn bewusst vorgeplant in spätere Schichten assigniert werden soll.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Forces ODIN to assign tickets only to people in the currently active shift instance.</p>
          <p><strong>Active:</strong> Future shifts are excluded from actual assignment. This is the safe default for immediate operational dispatch.</p>
          <p><strong>Inactive:</strong> Scheduled tickets may be assigned to a planned later shift within the configured assignment window, provided the weekly plan recognizes that shift.</p>
          <p><strong>Recommendation:</strong> Keep enabled during normal dispatch operations. Only disable when deliberately pre-assigning into future shifts.</p>
        </>
      ),
    },
    {
      key: 'assignment.maxTicketsPerRun',
      label: de ? 'Max. Tickets pro Run' : 'Max Tickets per Run',
      type: 'number',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Begrenzt die maximale Anzahl an Tickets, die in einem einzelnen Engine-Lauf verarbeitet werden.</p>
          <p><strong>Auswirkung:</strong> Verhindert, dass ein einzelner Lauf bei extremer Ticketlast (z. B. nach längerem Crawler-Ausfall) zu lange dauert oder das System überlastet.</p>
          <p><strong>Nicht verarbeitete Tickets:</strong> Überschüssige Tickets werden im nächsten Lauf verarbeitet.</p>
          <p><strong>Empfehlung:</strong> 200–500 für normale Betriebslast.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Limits the maximum number of tickets processed in a single engine run.</p>
          <p><strong>Effect:</strong> Prevents a single run from taking too long or overloading the system during extreme ticket load (e.g. after an extended crawler outage).</p>
          <p><strong>Unprocessed tickets:</strong> Excess tickets are handled in the next run.</p>
          <p><strong>Recommendation:</strong> 200–500 for normal operational load.</p>
        </>
      ),
    },
    {
      key: 'assignment.stopOnCriticalError',
      label: de ? 'Stop bei kritischem Fehler' : 'Stop on Critical Error',
      type: 'boolean',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Bestimmt, ob die Engine den gesamten Lauf bei einem kritischen Verarbeitungsfehler sofort abbricht.</p>
          <p><strong>Aktiv:</strong> Beim ersten kritischen Fehler (z. B. DB-Fehler, ungültige Datenstruktur) wird der gesamte Lauf abgebrochen. Bereits getroffene Entscheidungen des Laufs werden verworfen. Sicherer, da keine potenziell inkonsistenten Teilergebnisse entstehen.</p>
          <p><strong>Inaktiv:</strong> Die Engine überspringt fehlerhafte Tickets und verarbeitet die restlichen weiter. Das fehlerhafte Ticket wird als „error" geloggt. Resilienter, aber potenziell inkonsistent.</p>
          <p><strong>Empfehlung:</strong> Im Shadow-Betrieb deaktiviert lassen, um möglichst viele Daten zu sammeln. Im Live-Betrieb aktivieren für maximale Sicherheit.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Determines whether the engine aborts the entire run on a critical processing error.</p>
          <p><strong>Active:</strong> On the first critical error (e.g. DB error, invalid data structure) the entire run is aborted. Decisions already made during the run are discarded. Safer, as no potentially inconsistent partial results are produced.</p>
          <p><strong>Inactive:</strong> The engine skips faulty tickets and continues processing the rest. The faulty ticket is logged as "error". More resilient, but potentially inconsistent.</p>
          <p><strong>Recommendation:</strong> Keep disabled in Shadow mode to collect as much data as possible. Enable in Live mode for maximum safety.</p>
        </>
      ),
    },
    {
      key: 'assignment.cutoffMinutesBeforeShiftEnd',
      label: de ? 'Zuweisungsstopp vor Schichtende (Min.)' : 'Assignment Cutoff Before Shift End (min)',
      type: 'number',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Legt fest, wie viele Minuten vor Schichtende keine neuen Tickets mehr zugewiesen werden dürfen.</p>
          <p><strong>Beispiel:</strong> Bei Wert 45 und Schichtende 16:00 werden ab 15:15 keine neuen Tickets mehr zugewiesen.</p>
          <p><strong>Zweck:</strong> Verhindert, dass Mitarbeiter kurz vor Feierabend noch neue Tickets erhalten, die sie nicht mehr sinnvoll bearbeiten können.</p>
          <p><strong>Wert 0:</strong> Deaktiviert den Schichtende-Cutoff — Tickets werden bis zum letzten Moment zugewiesen.</p>
          <p><strong>Empfehlung:</strong> 45 Minuten als sichere Voreinstellung, bei Bedarf manuell anpassbar.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Defines how many minutes before shift end no new tickets may be assigned.</p>
          <p><strong>Example:</strong> With a value of 45 and shift end at 16:00, no new tickets are assigned after 15:15.</p>
          <p><strong>Goal:</strong> Prevents workers from receiving new tickets shortly before their shift ends that they cannot meaningfully complete.</p>
          <p><strong>Value 0:</strong> Disables the shift-end cutoff — tickets are assigned until the last moment.</p>
          <p><strong>Recommendation:</strong> 10–20 minutes, depending on average handling time.</p>
        </>
      ),
    },
    {
      key: 'assignment.maxSameSystemSmartHands',
      label: de ? 'Max gleicher Systemname (Smart Hands)' : 'Max Same System (Smart Hands)',
      type: 'number',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Maximale Anzahl an Smart-Hands-Tickets mit dem gleichen Systemnamen, die einer einzelnen Person zugewiesen werden dürfen.</p>
          <p><strong>Zweck:</strong> In manchen Fällen ist eine Bündelung sinnvoll (ein Techniker bearbeitet mehrere Aufgaben am selben System). Ein zu hoher Wert kann aber bedeuten, dass ein Mitarbeiter mit einem System überlastet wird.</p>
          <p><strong>Empfehlung:</strong> 2–4 je nach Arbeitsumfang pro Ticket. Standard: 3.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Maximum number of Smart Hands tickets with the same system name that can be assigned to a single person.</p>
          <p><strong>Goal:</strong> In some cases bundling is beneficial (one technician handles multiple tasks on the same system). However, too high a value may overload a worker with a single system.</p>
          <p><strong>Recommendation:</strong> 2–4 depending on workload per ticket. Default: 3.</p>
        </>
      ),
    },
    {
      key: 'assignment.maxSameSystemCrossConnect',
      label: de ? 'Max gleicher Systemname (Cross Connect)' : 'Max Same System (Cross Connect)',
      type: 'number',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Maximale Anzahl an Cross-Connect-Tickets mit dem gleichen Systemnamen, die einer einzelnen Person zugewiesen werden dürfen.</p>
          <p><strong>Zweck:</strong> Steuert bewusst, ob Cross-Connect-Arbeiten am selben System gebündelt oder verteilt werden sollen.</p>
          <p><strong>Niedriger Wert:</strong> Verhindert, dass eine Person alle CC-Arbeiten an einem System allein erhält. Nachteil: ggf. mehrere Anfahrten.</p>
          <p><strong>Hoher Wert:</strong> Erlaubt Bündelung, kann aber eine einzelne Person überlasten.</p>
          <p><strong>Empfehlung:</strong> 1–3 je nach Arbeitsaufwand. Standard: 2.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Maximum number of Cross Connect tickets with the same system name that can be assigned to a single person.</p>
          <p><strong>Goal:</strong> Deliberately controls whether Cross Connect work on the same system is bundled or distributed.</p>
          <p><strong>Low value:</strong> Prevents one person from receiving all CC work on a system. Downside: potentially more trips.</p>
          <p><strong>High value:</strong> Allows bundling, but may overload a single person.</p>
          <p><strong>Recommendation:</strong> 1–3 depending on workload. Default: 2.</p>
        </>
      ),
    },
    {
      key: 'assignment.supportedTicketTypes',
      label: de ? 'Unterstützte Tickettypen' : 'Supported Ticket Types',
      type: 'text',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Kommagetrennte Liste der Tickettypen, die die Engine verarbeiten darf.</p>
          <p><strong>Mögliche Werte:</strong> TroubleTicket, SmartHands, CrossConnect, Scheduled, Other</p>
          <p><strong>Auswirkung:</strong> Tickets, deren normalisierter Typ nicht in dieser Liste steht, werden als „not_relevant" eingestuft und nicht zugewiesen. Dies schützt vor ungewollter Zuweisung unbekannter oder neuer Tickettypen.</p>
          <p><strong>Beispiel:</strong> <code>TroubleTicket,SmartHands,CrossConnect</code></p>
          <p><strong>Hinweis:</strong> Groß-/Kleinschreibung wird bei der Prüfung normalisiert. Die Engine hat umfangreiche Alias-Tabellen für Varianten.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Comma-separated list of ticket types the engine is allowed to process.</p>
          <p><strong>Possible values:</strong> TroubleTicket, SmartHands, CrossConnect, Scheduled, Other</p>
          <p><strong>Effect:</strong> Tickets whose normalized type is not in this list are classified as "not_relevant" and not assigned. This protects against unintended assignment of unknown or new ticket types.</p>
          <p><strong>Example:</strong> <code>TroubleTicket,SmartHands,CrossConnect</code></p>
          <p><strong>Note:</strong> Case is normalized during checks. The engine has extensive alias tables for variants.</p>
        </>
      ),
    },
    {
      key: 'assignment.insufficientResources',
      label: de ? 'Ressourcenmangel-Flag' : 'Insufficient Resources Flag',
      type: 'boolean',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Aktiviert eine Ausnahmeregel für die Sortenreinheit (Queue Purity). Im Normalfall dürfen Cross-Connect-Worker keine Trouble Tickets erhalten und umgekehrt.</p>
          <p><strong>Aktiv:</strong> Wenn ein Cross-Connect-Worker aktive CC-Tickets mit einer Restlaufzeit von mehr als 24 Stunden hat, darf die Engine ihm zusätzlich Trouble Tickets zuweisen. Diese Ausnahme greift nur bei echtem Ressourcenmangel.</p>
          <p><strong>Inaktiv:</strong> Die strikte Sortenreinheit wird durchgesetzt. CC-Worker erhalten ausschließlich CC-Tickets.</p>
          <p><strong>⚠ Fachlicher Hinweis:</strong> Die genaue Definition von „Ressourcenmangel" ist derzeit nicht final spezifiziert. Das Flag wird manuell gesetzt und sollte vor der Aktivierung mit dem Teamlead abgestimmt werden.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Enables an exception rule for Queue Purity. Normally Cross Connect workers may not receive Trouble Tickets and vice versa.</p>
          <p><strong>Active:</strong> When a Cross Connect worker has active CC tickets with more than 24 hours remaining, the engine may additionally assign Trouble Tickets. This exception only applies during genuine resource shortages.</p>
          <p><strong>Inactive:</strong> Strict queue purity is enforced. CC workers receive CC tickets only.</p>
          <p><strong>⚠ Note:</strong> The exact definition of "insufficient resources" is not yet finalized. The flag is set manually and should be coordinated with the team lead before activation.</p>
        </>
      ),
    },
  ];
}

function getWritebackSettingDefs(lang: Lang): SettingDef[] {
  const de = lang === 'de';
  return [
    {
      key: 'writeback.enabled',
      label: de ? 'Jarvis-Writeback aktivieren' : 'Enable Jarvis writeback',
      type: 'boolean',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Aktiviert die Funktion, mit der ODIN nach einer Entscheidung den Jarvis-Owner am Ticket setzen darf.</p>
          <p><strong>Wichtig:</strong> Dies ist keine reine Crawler-Option. Der Crawler liefert nur den Snapshot, ODIN erzeugt daraus eine geprüfte Writeback-Aktion.</p>
          <p><strong>Empfehlung:</strong> Erst mit <em>Shadow only</em> testen, danach <em>Manual Confirm</em> nutzen, bevor automatische Ausführung erlaubt wird.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Allows ODIN to set the Jarvis ticket owner after an assignment decision.</p>
          <p><strong>Important:</strong> This is not only a crawler option. The crawler provides the snapshot, ODIN creates an audited writeback action.</p>
          <p><strong>Recommendation:</strong> Validate with <em>Shadow only</em> first, then use <em>Manual confirm</em> before allowing automatic execution.</p>
        </>
      ),
    },
    {
      key: 'writeback.mode',
      label: de ? 'Writeback-Modus' : 'Writeback mode',
      type: 'select',
      options: ['shadow_only', 'manual_confirm', 'assisted_auto', 'full_auto'],
      tooltip: de ? (
        <>
          <p><strong>shadow_only:</strong> ODIN prüft und protokolliert, schreibt aber keinen Owner in Jarvis.</p>
          <p><strong>manual_confirm:</strong> Jede Aktion muss im ODIN-Panel manuell bestätigt werden.</p>
          <p><strong>assisted_auto:</strong> ODIN darf geprüfte Aktionen ausführen, das Team bleibt informiert.</p>
          <p><strong>full_auto:</strong> Vollautomatische Ausführung. Nur verwenden, wenn Shadow- und Manual-Confirm-Phase stabil waren.</p>
        </>
      ) : (
        <>
          <p><strong>shadow_only:</strong> ODIN validates and logs only, without changing Jarvis.</p>
          <p><strong>manual_confirm:</strong> Every action must be confirmed in ODIN.</p>
          <p><strong>assisted_auto:</strong> ODIN may execute validated actions while keeping the team informed.</p>
          <p><strong>full_auto:</strong> Fully automatic execution. Use only after stable shadow and manual-confirm phases.</p>
        </>
      ),
    },
    {
      key: 'writeback.pilot.enabled',
      label: de ? 'Nur Pilot-Mitarbeiter testen' : 'Test pilot employee only',
      type: 'boolean',
      tooltip: de ? (
        <>
          <p><strong>Bedeutung:</strong> Beschränkt Jarvis-Writeback auf genau einen Mitarbeiter.</p>
          <p>Alle anderen Writeback-Aktionen werden bei Validierung und Ausführung blockiert. Das ist die sichere Testphase, bevor du Writeback für alle freigibst.</p>
        </>
      ) : (
        <>
          <p><strong>Purpose:</strong> Limits Jarvis writeback to exactly one employee.</p>
          <p>All other writeback actions are blocked during validation and execution. This is the safe rollout phase before enabling writeback for everyone.</p>
        </>
      ),
    },
    {
      key: 'writeback.pilot.employeeSelector',
      label: de ? 'Pilot-Mitarbeiter' : 'Pilot employee',
      type: 'text',
      tooltip: de ? (
        <>
          <p><strong>Was eintragen?</strong> ODIN-ID, Name, E-Mail, Jarvis Display Name, Initialen oder Jarvis Owner-Code des Mitarbeiters.</p>
          <p><strong>Beispiel:</strong> <code>Patrick Brode</code>, <code>patrick@example.com</code> oder ein Owner-Code wie <code>PBROD</code>.</p>
          <p>Wenn Pilotmodus aktiv ist und dieses Feld leer bleibt, blockiert ODIN aus Sicherheitsgründen alle Writeback-Aktionen.</p>
        </>
      ) : (
        <>
          <p><strong>What to enter?</strong> ODIN id, name, email, Jarvis display name, initials, or Jarvis owner code.</p>
          <p><strong>Example:</strong> <code>Patrick Brode</code>, <code>patrick@example.com</code>, or an owner code such as <code>PBROD</code>.</p>
          <p>If pilot mode is active and this field is empty, ODIN blocks all writeback actions for safety.</p>
        </>
      ),
    },
    {
      key: 'writeback.killSwitch',
      label: de ? 'Notfallstopp' : 'Emergency kill switch',
      type: 'boolean',
      tooltip: de ? (
        <p>Blockiert sofort alle Writeback-Ausführungen, auch wenn Writeback grundsätzlich aktiviert ist.</p>
      ) : (
        <p>Immediately blocks all writeback execution, even when writeback is generally enabled.</p>
      ),
    },
    {
      key: 'writeback.allowOverwriteExistingAssignee',
      label: de ? 'Bestehenden Owner überschreiben' : 'Overwrite existing owner',
      type: 'boolean',
      tooltip: de ? (
        <p>Erlaubt ODIN, Tickets zu überschreiben, die in Jarvis bereits einen Owner haben. Für den Start besser deaktiviert lassen.</p>
      ) : (
        <p>Allows ODIN to overwrite tickets that already have an owner in Jarvis. Keep disabled for initial rollout.</p>
      ),
    },
    {
      key: 'writeback.requireFreshCrawlerData',
      label: de ? 'Frische Crawler-Daten erzwingen' : 'Require fresh crawler data',
      type: 'boolean',
      tooltip: de ? (
        <p>Verhindert Writeback, wenn der Crawler-Snapshot zu alt ist. Das schützt vor Zuweisungen auf veraltete Ticketstände.</p>
      ) : (
        <p>Blocks writeback when the crawler snapshot is too old. This protects against assignments based on stale ticket state.</p>
      ),
    },
    {
      key: 'writeback.maxSnapshotAgeMinutes',
      label: de ? 'Max. Snapshot-Alter (Min.)' : 'Max snapshot age (min)',
      type: 'number',
      tooltip: de ? (
        <p>Maximales Alter der Crawler-Daten, bevor ODIN keine Jarvis-Owner mehr schreiben darf.</p>
      ) : (
        <p>Maximum crawler snapshot age before ODIN is no longer allowed to write Jarvis owners.</p>
      ),
    },
    {
      key: 'writeback.maxExecutionRetries',
      label: de ? 'Max. Ausführungsversuche' : 'Max execution retries',
      type: 'number',
      tooltip: de ? (
        <p>Wie oft eine fehlgeschlagene Writeback-Aktion erneut versucht werden darf, bevor sie als fehlgeschlagen stehen bleibt.</p>
      ) : (
        <p>How often a failed writeback action may be retried before it remains failed.</p>
      ),
    },
    {
      key: 'writeback.queueEnabled.smartHands',
      label: de ? 'Queue Smart Hands' : 'Queue Smart Hands',
      type: 'boolean',
      tooltip: de ? <p>Erlaubt Owner-Writeback für Smart-Hands-Tickets.</p> : <p>Allows owner writeback for Smart Hands tickets.</p>,
    },
    {
      key: 'writeback.queueEnabled.crossConnect',
      label: de ? 'Queue Cross Connect' : 'Queue Cross Connect',
      type: 'boolean',
      tooltip: de ? <p>Erlaubt Owner-Writeback für Cross-Connect-Tickets.</p> : <p>Allows owner writeback for Cross Connect tickets.</p>,
    },
    {
      key: 'writeback.queueEnabled.trouble',
      label: de ? 'Queue Trouble Tickets' : 'Queue Trouble Tickets',
      type: 'boolean',
      tooltip: de ? <p>Erlaubt Owner-Writeback für Trouble-Tickets.</p> : <p>Allows owner writeback for Trouble Tickets.</p>,
    },
    {
      key: 'writeback.queueEnabled.deinstall',
      label: de ? 'Queue Deinstall' : 'Queue Deinstall',
      type: 'boolean',
      tooltip: de ? <p>Erlaubt Owner-Writeback für Deinstall-Tickets.</p> : <p>Allows owner writeback for Deinstall tickets.</p>,
    },
    {
      key: 'writeback.allowAutoUnassign',
      label: de ? 'Automatische Abweisung erlauben' : 'Allow auto-unassign',
      type: 'boolean',
      tooltip: de ? (
        <p>Erlaubt ODIN, einen bestehenden Owner automatisch zu entfernen, wenn ein harter Grund vorliegt, zum Beispiel krank oder nicht zuweisbar.</p>
      ) : (
        <p>Allows ODIN to remove an existing owner automatically when there is a hard reason, for example sick or not assignable.</p>
      ),
    },
    {
      key: 'writeback.allowAutoReassign',
      label: de ? 'Automatische Neuzuweisung erlauben' : 'Allow auto-reassign',
      type: 'boolean',
      tooltip: de ? (
        <p>Erlaubt ODIN, einen bestehenden Owner automatisch durch einen anderen zu ersetzen. Für den Start besser nur mit manueller Freigabe nutzen.</p>
      ) : (
        <p>Allows ODIN to replace an existing owner automatically. For rollout, use with manual approval first.</p>
      ),
    },
    {
      key: 'writeback.requireManualApprovalForUnassign',
      label: de ? 'Freigabe für Abweisung' : 'Approval for unassign',
      type: 'boolean',
      tooltip: de ? <p>Abweisungen müssen vor der Ausführung manuell bestätigt werden.</p> : <p>Unassignments must be manually approved before execution.</p>,
    },
    {
      key: 'writeback.requireManualApprovalForReassign',
      label: de ? 'Freigabe für Neuzuweisung' : 'Approval for reassign',
      type: 'boolean',
      tooltip: de ? <p>Neuzuweisungen müssen vor der Ausführung manuell bestätigt werden.</p> : <p>Reassignments must be manually approved before execution.</p>,
    },
    {
      key: 'writeback.allowOtherTeamsAssignment',
      label: de ? 'Andere Teams erlauben' : 'Allow other teams',
      type: 'boolean',
      tooltip: de ? (
        <p>Erlaubt Writeback auch für Zuweisungen außerhalb des primären Teams. Nur aktivieren, wenn dieser Jarvis-Dialog fachlich gewollt ist.</p>
      ) : (
        <p>Allows writeback for assignments outside the primary team. Enable only if this Jarvis flow is intended.</p>
      ),
    },
  ];
}

export function AssignmentSettingsPanel() {
  const { settings, loading, settingsSaving, updateSettings, fetchSettings } = useAssignmentStore();
  const { language } = useLanguage();
  const de = language === 'de';
  const [local, setLocal] = useState<Record<string, string>>({});
  const settingDefs = getSettingDefs(language);
  const writebackSettingDefs = getWritebackSettingDefs(language);

  const ticketTypeOptions = ['TroubleTicket', 'SmartHands', 'CrossConnect', 'Scheduled', 'Other'];

  const sliderConfig: Partial<Record<SettingDef['key'], { min: number; max: number; step: number }>> = {
    'assignment.crawlerMaxAgeMinutes': { min: 1, max: 30, step: 1 },
    'assignment.planningWindowHours': { min: 1, max: 168, step: 1 },
    'assignment.maxTicketsPerRun': { min: 25, max: 1000, step: 25 },
    'assignment.cutoffMinutesBeforeShiftEnd': { min: 0, max: 60, step: 5 },
    'assignment.maxSameSystemSmartHands': { min: 1, max: 10, step: 1 },
    'assignment.maxSameSystemCrossConnect': { min: 1, max: 10, step: 1 },
    'writeback.maxExecutionRetries': { min: 0, max: 10, step: 1 },
    'writeback.maxSnapshotAgeMinutes': { min: 1, max: 30, step: 1 },
  };

  useEffect(() => {
    if (!settings) {
      fetchSettings();
    }
  }, [settings, fetchSettings]);

  useEffect(() => {
    if (settings) {
      setLocal({ ...settings });
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const getBooleanValue = (key: string) => (local[key] || 'false') === 'true';
  const getNumberValue = (key: string, fallback: number) => {
    const parsed = Number(local[key]);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const getTicketTypes = () => {
    return (local['assignment.supportedTicketTypes'] || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  };
  const updateTicketTypes = (ticketType: string, checked: boolean) => {
    const next = new Set(getTicketTypes());
    if (checked) next.add(ticketType);
    else next.delete(ticketType);
    handleChange('assignment.supportedTicketTypes', Array.from(next).join(','));
  };

  const handleSave = async () => {
    await updateSettings(local as Partial<AssignmentSettings>);
  };

  if (!settings && loading) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/60 p-6 text-sm text-muted-foreground">
        {de ? 'Einstellungen werden geladen...' : 'Loading settings...'}
      </div>
    );
  }

  const renderNumberControl = (def: SettingDef) => {
    const config = sliderConfig[def.key];
    const value = getNumberValue(def.key, config?.min || 0);

    if (!config) {
      return (
        <Input
          type="number"
          value={local[def.key] || ''}
          onChange={(e) => handleChange(def.key, e.target.value)}
        />
      );
    }

    return (
      <div className="space-y-3 rounded-xl border border-border/40 bg-background/40 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{de ? 'Wert' : 'Value'}</span>
          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">{value}</span>
        </div>
        <Slider
          value={[value]}
          min={config.min}
          max={config.max}
          step={config.step}
          onValueChange={(values) => handleChange(def.key, String(values[0] ?? config.min))}
        />
        <Input
          type="number"
          min={config.min}
          max={config.max}
          step={config.step}
          value={String(value)}
          onChange={(e) => handleChange(def.key, e.target.value)}
        />
      </div>
    );
  };

  const renderField = (def: SettingDef) => {
    if (def.key === 'assignment.mode') {
      return (
        <div className="grid w-full grid-cols-3 gap-2">
          {['shadow', 'dry-run', 'live'].map((option) => {
            const active = (local[def.key] || 'shadow') === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleChange(def.key, option)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/40 bg-background/50 text-foreground hover:border-primary/40'
                }`}
              >
                {option === 'dry-run' ? 'Dry-Run' : option === 'live' ? 'Live' : 'Shadow'}
              </button>
            );
          })}
        </div>
      );
    }

    if (def.key === 'assignment.fallbackTieBreaker') {
      return (
        <div className="grid w-full grid-cols-2 gap-2">
          {[
            { value: 'stable-id', label: 'Stable ID' },
            { value: 'random', label: 'Random' },
          ].map((option) => {
            const active = (local[def.key] || 'stable-id') === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleChange(def.key, option.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/40 bg-background/50 text-foreground hover:border-primary/40'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }

    if (def.key === 'writeback.mode') {
      const options = [
        { value: 'shadow_only', label: de ? 'Shadow only' : 'Shadow only' },
        { value: 'manual_confirm', label: de ? 'Manuell bestätigen' : 'Manual confirm' },
        { value: 'assisted_auto', label: de ? 'Assistiert automatisch' : 'Assisted auto' },
        { value: 'full_auto', label: de ? 'Vollautomatisch' : 'Full auto' },
      ];
      return (
        <div className="grid gap-2 rounded-xl border border-border/40 bg-background/40 p-3">
          {options.map((option) => {
            const active = (local[def.key] || 'shadow_only') === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleChange(def.key, option.value)}
                className={`rounded-lg border px-3 py-2 text-sm text-left transition ${active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/40 bg-background/50 text-foreground hover:border-primary/40'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }

    if (def.key === 'assignment.supportedTicketTypes') {
      const selected = new Set(getTicketTypes());
      return (
        <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/40 bg-background/40 p-3 sm:grid-cols-2">
          {ticketTypeOptions.map((ticketType) => (
            <label key={ticketType} className="flex items-center gap-2 rounded-lg border border-border/30 px-3 py-2 text-sm">
              <Checkbox
                checked={selected.has(ticketType)}
                onCheckedChange={(checked) => updateTicketTypes(ticketType, checked === true)}
              />
              <span>{ticketType}</span>
            </label>
          ))}
        </div>
      );
    }

    if (def.type === 'boolean') {
      return (
        <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2.5">
          <span className="text-sm text-foreground">{getBooleanValue(def.key) ? (de ? 'Aktiv' : 'Active') : (de ? 'Inaktiv' : 'Inactive')}</span>
          <Switch
            checked={getBooleanValue(def.key)}
            onCheckedChange={(checked) => handleChange(def.key, checked ? 'true' : 'false')}
          />
        </div>
      );
    }

    if (def.type === 'number') {
      return renderNumberControl(def);
    }

    if (def.type === 'select') {
      return (
        <div className="grid gap-2 rounded-xl border border-border/40 bg-background/40 p-3">
          {def.options?.map((option) => {
            const active = (local[def.key] || '') === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleChange(def.key, option)}
                className={`rounded-lg border px-3 py-2 text-sm text-left transition ${active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/40 bg-background/50 text-foreground hover:border-primary/40'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <Input
        type="text"
        value={local[def.key] || ''}
        onChange={(e) => handleChange(def.key, e.target.value)}
      />
    );
  };

  return (
    <div className="rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground">{de ? 'Einstellungen' : 'Settings'}</h3>
        <div className="flex items-center gap-2">
          <InfoTooltip title={de ? 'Neu laden' : 'Reload'} side="bottom">
            {de ? (
              <>
                <p>Lädt die aktuell in der Datenbank gespeicherten Einstellungen neu. Lokale, noch nicht gespeicherte Änderungen gehen verloren.</p>
                <p><strong>Typische Nutzung:</strong> Verwenden, wenn ein anderer Benutzer parallel Einstellungen geändert hat oder wenn Sie Ihre lokalen Änderungen verwerfen möchten.</p>
              </>
            ) : (
              <>
                <p>Reloads the settings currently stored in the database. Local unsaved changes will be lost.</p>
                <p><strong>Typical use:</strong> Use when another user has changed settings in parallel or when you want to discard your local changes.</p>
              </>
            )}
          </InfoTooltip>
          <button
            onClick={() => fetchSettings()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border/40 bg-background/60 hover:bg-background/80 transition text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-3 h-3" />
            {de ? 'Neu laden' : 'Reload'}
          </button>
          <InfoTooltip title={de ? 'Speichern' : 'Save'} side="bottom">
            {de ? (
              <>
                <p>Übernimmt die angezeigten Einstellungen dauerhaft in die Datenbank. Änderungen werden sofort wirksam und gelten für den nächsten Engine-Lauf.</p>
                <p><strong>Hinweis:</strong> Bereits laufende Zuweisungsprozesse werden durch das Speichern nicht beeinflusst. Die neuen Werte greifen erst beim nächsten Lauf.</p>
                <p><strong>Auswirkung:</strong> Die Änderung wird im Audit-Log protokolliert.</p>
              </>
            ) : (
              <>
                <p>Persists the displayed settings to the database. Changes take effect immediately for the next engine run.</p>
                <p><strong>Note:</strong> Already running assignment processes are not affected by saving. New values apply from the next run.</p>
                <p><strong>Effect:</strong> The change is recorded in the audit log.</p>
              </>
            )}
          </InfoTooltip>
          <button
            onClick={handleSave}
            disabled={settingsSaving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            {settingsSaving ? (de ? 'Speichern...' : 'Saving...') : (de ? 'Speichern' : 'Save')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {settingDefs.map((def) => (
          <div key={def.key} className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {def.label}
              <InfoTooltip title={def.label} side="right" align="start">{def.tooltip}</InfoTooltip>
            </label>
            {renderField(def)}
          </div>
        ))}
      </div>

      <div className="border-t border-border/30 px-4 py-3">
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-semibold text-amber-200">
              {de ? 'Jarvis-Writeback: Namen automatisch an Tickets schreiben' : 'Jarvis writeback: write names to tickets automatically'}
            </h4>
            <p className="text-xs leading-relaxed text-amber-100/75">
              {de
                ? 'Diese Optionen steuern, ob ODIN nach einer Zuweisungsentscheidung den Owner im Jarvis-Ticket setzen darf. Standard ist sicher deaktiviert: erst Shadow prüfen, dann manuelle Freigabe, danach optional automatisieren.'
                : 'These options control whether ODIN may set the owner on the Jarvis ticket after an assignment decision. The safe default is disabled: validate in shadow, then use manual approval, then optionally automate.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-4 pb-4">
        {writebackSettingDefs.map((def) => (
          <div key={def.key} className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {def.label}
              <InfoTooltip title={def.label} side="right" align="start">{def.tooltip}</InfoTooltip>
            </label>
            {renderField(def)}
          </div>
        ))}
      </div>
    </div>
  );
}
