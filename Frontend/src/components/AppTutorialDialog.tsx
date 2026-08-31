import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, ChevronLeft, ChevronRight, Languages, Rocket, Layout, BarChart2,
  Settings2, Brain, Eye, Calendar, FileText, Ticket, Tv, ScrollText, FileCheck,
  MessageSquare, CalendarClock, Shield, UsersRound, Zap, Trash2, History,
  Gauge, Heart, UserCog, Bell, Users, Sliders, Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useLanguage, type LanguageCode } from "../context/LanguageContext";
import { FlagIcon } from "./FlagIcon";

/* ─────────────────────────────────────────────────────────────────────── */
/*  TYPES                                                                  */
/* ─────────────────────────────────────────────────────────────────────── */

type TutorialStep = {
  title: string;
  body: string;
  icon: React.ReactNode;
  highlight?: string;
  isWelcome?: boolean;
};

type TutorialCopy = {
  languageTitle: string;
  languageHint: string;
  start: string;
  title: string;
  close: string;
  back: string;
  next: string;
  finish: string;
  skip: string;
  restart: string;
  progress: string;
  steps: TutorialStep[];
};

/* ─────────────────────────────────────────────────────────────────────── */
/*  TAB HIGHLIGHT BADGE                                                    */
/* ─────────────────────────────────────────────────────────────────────── */

function TabBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#00d8ff]/30 bg-[#00d8ff]/10 px-2.5 py-1 text-xs font-semibold text-[#00d8ff] shadow-[0_0_12px_rgba(0,216,255,0.15)]">
      {icon}
      {label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  ADMIN TAB CARD                                                         */
/* ─────────────────────────────────────────────────────────────────────── */

function AdminTabCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="theme-glass-inset flex gap-3 rounded-xl p-3 transition hover:border-[#00d8ff]/25 hover:bg-[#00d8ff]/[0.06]">
      <div className="theme-glass-inset mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  TUTORIAL CONTENT – DE / EN                                             */
/* ─────────────────────────────────────────────────────────────────────── */

const TUTORIAL: Record<LanguageCode, TutorialCopy> = {
  de: {
    languageTitle: "Tutorial-Sprache wählen",
    languageHint: "Willkommen bei ODIN. Wähle deine bevorzugte Sprache für die Produkt-Tour.",
    start: "Tour starten",
    title: "ODIN Produkt-Tour",
    close: "Schließen",
    back: "Zurück",
    next: "Weiter",
    finish: "Los geht's!",
    skip: "Überspringen",
    restart: "Erneut starten",
    progress: "Schritt",
    steps: [
      /* ── 0  WELCOME ── */
      {
        title: "Willkommen bei O.D.I.N",
        icon: <Sparkles className="h-5 w-5 text-[#00d8ff]" />,
        isWelcome: true,
        body: "**Operations Dispatching and Intelligence Node**\n\nODIN ist die zentrale Plattform deines Teams für den gesamten operativen Betrieb. Von Schichtplanung über Ticketverteilung bis hin zur vollautomatischen Zuweisung – alles in einer einzigen, modernen Oberfläche.\n\n**Warum ODIN?**\nStatt verstreuter Excel-Tabellen, E-Mail-Ketten und isolierter Einzelsysteme vereint ODIN alle operativen Prozesse an einem Ort. Das Ergebnis: mehr Transparenz, weniger Fehler, schnellere Entscheidungen.\n\n**Was du erwarten kannst:**\n• Echtzeit-Überblick über Tickets, Schichten und Teamauslastung\n• Intelligente, regelbasierte Ticketzuweisung mit Dry-/Shadow-Run\n• Schichtplanung mit Feiertagen, Abwesenheiten und Warnungen\n• Teams-Integration für automatische Benachrichtigungen\n• TV-Dashboard für Teammonitore\n• Rollenbasierte Zugriffskontrolle und Audit-Trail\n\n**Die Vision:** ODIN als Single Point of Truth – ein System, das nicht nur reagiert, sondern vorausschauend unterstützt und operative Exzellenz mit datengetriebener Entscheidungsfindung verbindet.",
      },
      /* ── 1  NAVIGATION ── */
      {
        title: "Navigation und Aufbau",
        icon: <Layout className="h-5 w-5 text-sky-400" />,
        highlight: "Sidebar",
        body: "ODIN ist in drei Hauptbereiche gegliedert:\n\n**Header (oben)**\nZeigt Echtzeit-Status: Crawler-Updates, aktive Tickets, Schichtplan-Upload, Teams-Status, ODIN-Logik-Status, Sprachauswahl und dein Profil.\n\n**Sidebar (links)**\nDie Hauptnavigation mit allen Bereichen. Gruppen wie Dashboard und Schichtplan lassen sich auf- und zuklappen. Im kompakten Modus zeigen Icons den Bereich an.\n\n**Deine Navigationsreiter:**\n[tab:LayoutDashboard:Dashboard] [tab:Calendar:Schichtplan] [tab:FileText:Handover] [tab:Ticket:Tickets] [tab:Brain:ODIN-Logik] [tab:CalendarClock:Schichtplaner] [tab:MessageSquare:Teams Center] [tab:Tv:TV Dashboard] [tab:FileCheck:Commit Compliance] [tab:Shield:Admin Settings] [tab:UsersRound:User Management]\n\n**Hauptbereich (Mitte)**\nDer Inhalt des gewählten Reiters. Jede Seite bietet kontextbezogene Filter, Aktionen und Informationen.",
      },
      /* ── 2  DASHBOARD ── */
      {
        title: "Dashboard",
        icon: <BarChart2 className="h-5 w-5 text-indigo-400" />,
        highlight: "Dashboard",
        body: "Das Dashboard ist deine Startseite und zentrale Kommandozentrale.\n\n**Was du hier siehst:**\n• **Aktive Tickets** nach Typ – Smart Hand, Trouble Ticket, Cross Connect\n• **Letzte Aktivitäten** im Team in Echtzeit\n• **Schichtplan-Status** und aktuelle Besetzung\n• **Systemgesundheit** über die Metriken im Header\n\n**Unterseiten:**\n[tab:BarChart2:Statistiken] – Detaillierte Diagramme: Dispatch vs. Closed, Ticket-Typen, Commit-Gesundheit, Tagestrends sowie integrierte Audit-Kennzahlen\n\n**Tipp:** Über das Untermenü in der Sidebar erreichst du den Statistik-Hub direkt.",
      },
      /* ── 3  SCHICHTPLAN ── */
      {
        title: "Schichtplan & Wochenplanung",
        icon: <Calendar className="h-5 w-5 text-emerald-400" />,
        highlight: "Schichtplan",
        body: "[tab:Calendar:Schichtplan] **Monatsansicht**\nDie gesamte Monatsbesetzung auf einen Blick. Jede Zelle zeigt den geplanten Mitarbeiter. Feiertage werden farblich markiert, Abwesenheiten sind sofort sichtbar. Neue Schichtpläne werden per **Excel-Upload** importiert.\n\n[tab:CalendarClock:Wochenplanung] **Feinsteuerung**\nErmöglicht die tagesgenaue Personalsteuerung. Du legst Rollen fest, verschiebst Zuweisungen und siehst offene Lücken – ideal für kurzfristige Anpassungen.\n\n**Automatik:**\n• Feiertage deines Bundeslandes werden automatisch berücksichtigt\n• Hinterlegte Abwesenheiten (Urlaub, Krankheit) fließen direkt ein\n• Warnungen bei Unterbesetzung oder Regelkonflikten",
      },
      /* ── 4  TICKETS & HANDOVER ── */
      {
        title: "Tickets, Handover & Compliance",
        icon: <Ticket className="h-5 w-5 text-rose-400" />,
        highlight: "Tickets",
        body: "[tab:Ticket:Tickets]\nDie zentrale Queue-Ansicht zeigt alle aktiven Tickets mit Status, Typ, Commit-Datum und zugewiesenem Bearbeiter. Filter nach Typ, Status oder Zeitraum helfen bei der Priorisierung.\n\n[tab:FileText:Handover]\nDokumentiert die Schichtübergabe. Offene Punkte, kritische Anmerkungen und Statusänderungen werden strukturiert erfasst – für eine lückenlose Schichtdokumentation.\n\n[tab:FileCheck:Commit Compliance]\nZeigt, wie termintreu Tickets geschlossen werden. Überfällige Tickets werden sofort sichtbar gemacht. Das hilft dem Team, SLA-Ziele einzuhalten.",
      },
      /* ── 5  ODIN LOGIC ── */
      {
        title: "ODIN-Logik & Auto Assignment",
        icon: <Brain className="h-5 w-5 text-violet-400" />,
        highlight: "ODIN-Logik",
        body: "[tab:Brain:ODIN-Logik] – Das Herzstück der Automatisierung\n\n**Drei Betriebsmodi:**\n• **Dry Run** – Simuliert Zuweisungen ohne Änderungen. Ideal zum Testen neuer Regeln.\n• **Shadow Run** – Führt Zuweisungen im Hintergrund aus und protokolliert die Ergebnisse, ohne echte Tickets zu ändern.\n• **Live-Modus** – Vollautomatische Ticketzuweisung anhand definierter Regeln, Rotationslogik und Verfügbarkeit.\n\n**Analyse-Werkzeuge:**\n• **Runs & Logs** – Komplette Lauf-Historie\n• **Ticketentscheidungen** – Warum wurde ein Ticket zugewiesen oder nicht?\n• **Logikbaum** – Visuelle Darstellung des Regelwerks\n• **Zuweisungsfluss** – Schritt-für-Schritt-Visualisierung\n\n**Goldene Regel:** Immer **Dry Run → Shadow Run → Live** – nie direkt in den Live-Modus springen.",
      },
      /* ── 6  TEAMS CENTER ── */
      {
        title: "Teams Communication Center",
        icon: <MessageSquare className="h-5 w-5 text-cyan-400" />,
        highlight: "Teams Center",
        body: "[tab:MessageSquare:Teams Center] – Microsoft Teams-Integration\n\n**Kanalversand:** Automatische Nachrichten an Teams-Kanäle bei Schichtänderungen, neuen Tickets oder Systemereignissen.\n\n**Persönliche Nachrichten:** Direkte Benachrichtigungen an einzelne Teammitglieder über den Microsoft Graph-Bot.\n\n**Diagnostik:** Das Fehlercenter zeigt nicht nur ob, sondern **warum** die Integration nicht funktioniert – Webhook-Status, Graph-Rechte, Token-Prüfung und Konnektivitätstests.\n\n**Event-Konfiguration:** Jedes ODIN-Event (Ticketzuweisung, Schichtplanänderung, Engine-Status) kann einzeln aktiviert, mit Formaten versehen und zeitlich eingeschränkt werden (Ruhezeiten).",
      },
      /* ── 7  TV & AUDIT ── */
      {
        title: "TV Dashboard & Audit-Log",
        icon: <Tv className="h-5 w-5 text-amber-400" />,
        highlight: "TV Dashboard",
        body: "[tab:Tv:TV Dashboard]\nEine für große Monitore optimierte Vollbildansicht mit den wichtigsten KPIs. Ideal für Teamräume, Leitstellen und Operations-Bildschirme. Übernimmt automatisch Sprache und Theme.\n\n**Features:** Auto-Scroll, einstellbare Slide-Dauer, kompakte Ticket-Karten, Schichtanzeige.\n\n[tab:Shield:Admin Settings]\nIm Audit-Bereich findest du das zentrale Aktivitaets- und Aenderungsprotokoll. Dort laufen Systemaktionen, Teams-Events und Konfigurationsaenderungen zusammen.",
      },
      /* ── 8  SCHICHTPLANER ── */
      {
        title: "Schichtplaner (Kontrollzentrum)",
        icon: <CalendarClock className="h-5 w-5 text-teal-400" />,
        highlight: "Schichtplaner",
        body: "[tab:CalendarClock:Schichtplaner] – Die Admin-Oberfläche für strategische Schichtplanung\n\n• **Draft-Generierung:** Erstellt automatisch Schichtplan-Entwürfe basierend auf Verfügbarkeit, Mitarbeiter-Präferenzen und hinterlegten Regeln.\n\n• **Entwurf prüfen:** Vorschau des generierten Plans mit Warnanzeigen bei Regelverletzungen, Unterbesetzung oder Konflikten.\n\n• **Aktivierung:** Macht einen geprüften Entwurf mit einem Klick zum aktiven Schichtplan.\n\n• **Regelkonfiguration:** Definiert Schichtfolgen, Mindestbesetzung, Sperrzeiten und Fairness-Regeln.\n\n**Zielgruppe:** Teamleiter und Planungsverantwortliche.",
      },
      /* ── 9  ADMIN SETTINGS (DETAIL) ── */
      {
        title: "Admin-Einstellungen im Detail",
        icon: <Shield className="h-5 w-5 text-sky-400" />,
        highlight: "Admin Settings",
        body: "[tab:Shield:Admin Settings] – Zentrale Konfiguration des gesamten Systems\n\nDie Admin-Einstellungen sind in **9 spezialisierte Reiter** gegliedert:",
      },
      /* ── 10  PERSONAL SETTINGS ── */
      {
        title: "Deine persönlichen Einstellungen",
        icon: <UserCog className="h-5 w-5 text-amber-400" />,
        highlight: "Einstellungen",
        body: "Unter **Einstellungen** (erreichbar über dein Profilmenü oben rechts) findest du alles, was ODIN an deine Arbeitsweise anpasst:\n\n[section:Profil]\n**Profil & Kompetenzprofil**\nDein Name, E-Mail, Standort und Team. Dazu dein Skill-Profil mit Bewertungen für Smart Hand, Trouble Ticket und Cross Connect – relevant für die automatische Ticketzuweisung.\n\n[section:App]\n**App-Einstellungen**\nSprache (Deutsch/Englisch) und Theme (Hell/Dunkel). Die Spracheinstellung wird serverseitig gespeichert und gilt überall – auch im TV Dashboard und Tutorial.\n\n[section:Benachrichtigungen]\n**Benachrichtigungen**\nE-Mail-Benachrichtigungen, Browser-Benachrichtigungen und Schicht-Erinnerungen individuell ein-/ausschalten.\n\n[section:Schichtplan-Präferenzen]\n**Schichtplan-Präferenzen** (Wunschkollegen & Schichtwünsche)\nHier wird es persönlich: Du kannst **bevorzugte Kollegen** angeben, mit denen du gerne zusammenarbeitest. Außerdem hinterlegst du deine **Schichtwünsche** – z.B. bevorzugte Schichtzeiten, Wochentage oder Sperrzeiten. Diese Präferenzen fließen direkt in die automatische Schichtplan-Generierung ein.\n\n[section:Ticket-Präferenzen]\n**Ticket-Präferenzen & Workload**\nBevorzugte Ticket-Typen, Flexibilität und Wachstumsbereiche. ODIN berücksichtigt diese Angaben bei der automatischen Zuweisung von Tickets.\n\n[section:Schwellenwerte]\n**System-Schwellenwerte**\nPersönliche Einstellungen für Schicht-Warnungen, Unterbesetzungs-Grenzwerte und Wellbeing-Schwellen.\n\n**Wichtig:** Gut gepflegte Präferenzen = bessere automatische Planung. Nimm dir 5 Minuten, um dein Profil einzurichten!",
      },
      /* ── 11  USER MANAGEMENT ── */
      {
        title: "User Management & Statistiken",
        icon: <UsersRound className="h-5 w-5 text-emerald-400" />,
        highlight: "User Management",
        body: "[tab:UsersRound:User Management]\nVerwaltet alle Benutzer, Rollen und granulare Zugriffsrechte. Jede einzelne Seite in ODIN kann individuell pro Rolle oder Abteilung freigeschaltet werden.\n\n**Rollen-Konzept:**\n• **Admin** – Voller Zugriff auf alle Funktionen\n• **Teamleiter** – Schichtplanung, Einstellungen, Berichte\n• **Mitarbeiter** – Dashboard, Tickets, eigene Einstellungen\n• **Viewer** – Nur Lesezugriff (z.B. Management-Reports)\n\n**Statistiken & Metriken:**\n[tab:BarChart2:Team-Statistiken] zeigen Dispatch- und Closed-Trends, Ticket-Typen-Verteilung, Status-Distribution und Commit-Gesundheit als interaktive Diagramme.\n\n**Systemmetriken** im Header: CPU, RAM, DB-Speicher, aktive Verbindungen, Online-User und Ticketlast.",
      },
      /* ── 12  VISION ── */
      {
        title: "Zukunft & Vision",
        icon: <Rocket className="h-5 w-5 text-amber-400" />,
        body: "ODIN wird kontinuierlich weiterentwickelt. Die Roadmap umfasst:\n\n• **Prädiktive Planung** – KI-gestützte Vorhersage von Ticketaufkommen und Personalengpässen\n• **Erweiterte Automation** – Mehrstufige Zuweisungslogik mit Eskalationsregeln\n• **Cross-Site-Koordination** – Standortübergreifende Schichtplanung und Ressourcenteilung\n• **Reporting Engine** – Automatische Berichte für Management und Compliance\n• **Mobile Ansicht** – Optimierte Oberfläche für unterwegs\n\n**Das Ziel:** ODIN als Single Point of Truth für den gesamten operativen Betrieb – transparent, automatisiert und nachvollziehbar.\n\nVielen Dank, dass du ODIN nutzt. Bei Fragen oder Feedback nutze den **Feedback-Button** in der App – wir lesen jede Nachricht.",
      },
    ],
  },
  en: {
    languageTitle: "Choose tutorial language",
    languageHint: "Welcome to ODIN. Choose your preferred language for the product tour.",
    start: "Start tour",
    title: "ODIN Product Tour",
    close: "Close",
    back: "Back",
    next: "Next",
    finish: "Let's go!",
    skip: "Skip",
    restart: "Restart",
    progress: "Step",
    steps: [
      /* ── 0  WELCOME ── */
      {
        title: "Welcome to O.D.I.N",
        icon: <Sparkles className="h-5 w-5 text-[#00d8ff]" />,
        isWelcome: true,
        body: "**Operations Dispatching and Intelligence Node**\n\nODIN is your team's central platform for the entire operational workflow. From shift planning through ticket distribution to fully automated assignment – everything in a single, modern interface.\n\n**Why ODIN?**\nInstead of scattered spreadsheets, email chains, and siloed systems, ODIN unifies all operational processes in one place. The result: more transparency, fewer errors, faster decisions.\n\n**What to expect:**\n• Real-time overview of tickets, shifts, and team utilization\n• Intelligent, rule-based ticket assignment with dry/shadow runs\n• Shift planning with public holidays, absences, and warnings\n• Teams integration for automatic notifications\n• TV dashboard for team monitors\n• Role-based access control and audit trail\n\n**The vision:** ODIN as the single point of truth – a system that not only reacts but proactively supports, connecting operational excellence with data-driven decision-making.",
      },
      /* ── 1  NAVIGATION ── */
      {
        title: "Navigation and structure",
        icon: <Layout className="h-5 w-5 text-sky-400" />,
        highlight: "Sidebar",
        body: "ODIN is organised into three main areas:\n\n**Header (top)**\nReal-time status: crawler updates, active tickets, shift plan upload, Teams status, ODIN logic status, language selector, and your profile.\n\n**Sidebar (left)**\nThe main navigation with all areas. Groups like Dashboard, Shift Plan, and Log can be collapsed and expanded. In compact mode, icons indicate each area.\n\n**Your navigation tabs:**\n[tab:LayoutDashboard:Dashboard] [tab:Calendar:Shift Plan] [tab:FileText:Handover] [tab:Ticket:Tickets] [tab:Brain:ODIN Logic] [tab:CalendarClock:Shift Planner] [tab:MessageSquare:Teams Center] [tab:Tv:TV Dashboard] [tab:ScrollText:Log] [tab:FileCheck:Commit Compliance] [tab:Shield:Admin Settings] [tab:UsersRound:User Management]\n\n**Main area (centre)**\nThe content of the selected tab. Each page provides contextual filters, actions, and information.",
      },
      /* ── 2  DASHBOARD ── */
      {
        title: "Dashboard",
        icon: <BarChart2 className="h-5 w-5 text-indigo-400" />,
        highlight: "Dashboard",
        body: "The dashboard is your home page and central command centre.\n\n**What you see here:**\n• **Active tickets** by type – Smart Hand, Trouble Ticket, Cross Connect\n• **Recent activity** across the team in real time\n• **Shift plan status** and current staffing\n• **System health** via the metrics in the header\n\n**Sub-pages:**\n[tab:BarChart2:Statistics] – Detailed charts: dispatch vs. closed, ticket types, commit health, daily trends\n[tab:FileCheck:Ticket Audit] – Complete traceability of all ticket actions (root users only)\n\n**Tip:** Access statistics and audit directly via the sidebar sub-menu.",
      },
      /* ── 3  SHIFT PLAN ── */
      {
        title: "Shift plan & week planning",
        icon: <Calendar className="h-5 w-5 text-emerald-400" />,
        highlight: "Shift Plan",
        body: "[tab:Calendar:Shift Plan] **Monthly view**\nThe entire monthly staffing at a glance. Each cell shows the assigned employee. Public holidays are colour-coded, absences are immediately visible. New shift plans are imported via **Excel upload**.\n\n[tab:CalendarClock:Week Planning] **Fine-grained control**\nAllows day-by-day staffing adjustments. Set roles, move assignments, and see open gaps – ideal for short-term changes.\n\n**Automation:**\n• Public holidays for your federal state are applied automatically\n• Stored absences (holiday, sick leave) are factored in directly\n• Warnings for understaffing or rule conflicts",
      },
      /* ── 4  TICKETS & HANDOVER ── */
      {
        title: "Tickets, handover & compliance",
        icon: <Ticket className="h-5 w-5 text-rose-400" />,
        highlight: "Tickets",
        body: "[tab:Ticket:Tickets]\nThe central queue view shows all active tickets with status, type, commit date, and assigned engineer. Filters by type, status, or time period help with prioritisation.\n\n[tab:FileText:Handover]\nDocuments the shift handover. Open items, critical notes, and status changes are captured in a structured way – for complete shift documentation.\n\n[tab:FileCheck:Commit Compliance]\nShows how punctually tickets are closed. Overdue tickets are immediately highlighted. Helps the team meet SLA targets.",
      },
      /* ── 5  ODIN LOGIC ── */
      {
        title: "ODIN logic & auto assignment",
        icon: <Brain className="h-5 w-5 text-violet-400" />,
        highlight: "ODIN Logic",
        body: "[tab:Brain:ODIN Logic] – The heart of automation\n\n**Three operating modes:**\n• **Dry run** – Simulates assignments without making changes. Ideal for testing new rules.\n• **Shadow run** – Executes assignments in the background and logs results without modifying actual tickets.\n• **Live mode** – Fully automatic ticket assignment based on defined rules, rotation logic, and availability.\n\n**Analysis tools:**\n• **Runs & logs** – Complete run history\n• **Ticket decisions** – Why was a ticket assigned or not?\n• **Logic tree** – Visual representation of the rule set\n• **Assignment flow** – Step-by-step visualisation\n\n**Golden rule:** Always **dry run → shadow run → live** – never jump straight to live mode.",
      },
      /* ── 6  TEAMS CENTER ── */
      {
        title: "Teams Communication Center",
        icon: <MessageSquare className="h-5 w-5 text-cyan-400" />,
        highlight: "Teams Center",
        body: "[tab:MessageSquare:Teams Center] – Microsoft Teams integration\n\n**Channel delivery:** Automatic messages to Teams channels on shift changes, new tickets, or system events.\n\n**Personal messages:** Direct notifications to individual team members via the Microsoft Graph bot.\n\n**Diagnostics:** The error centre shows not only whether but **why** the integration is failing – webhook status, Graph permissions, token checks, and connectivity tests.\n\n**Event configuration:** Every ODIN event (ticket assignment, shift plan change, engine status) can be individually enabled, formatted, and restricted by quiet hours.",
      },
      /* ── 7  TV & LOG ── */
      {
        title: "TV dashboard & log",
        icon: <Tv className="h-5 w-5 text-amber-400" />,
        highlight: "TV Dashboard",
        body: "[tab:Tv:TV Dashboard]\nA fullscreen view optimised for large monitors with the most important KPIs. Ideal for team rooms, operations centres, and wall displays. Automatically adopts language and theme.\n\n**Features:** Auto-scroll, configurable slide duration, compact ticket cards, shift display.\n\n[tab:ScrollText:Log]\nShows the chronological history of all system actions – who did what and when.\n\n**Sub-pages:**\n• **Teams notifications** – All sent Teams messages\n• **Automated assignment log** – All actions of the assignment engine",
      },
      /* ── 8  SHIFT PLANNER ── */
      {
        title: "Shift planner (control centre)",
        icon: <CalendarClock className="h-5 w-5 text-teal-400" />,
        highlight: "Shift Planner",
        body: "[tab:CalendarClock:Shift Planner] – The admin interface for strategic shift planning\n\n• **Draft generation:** Automatically creates shift plan drafts based on availability, employee preferences, and configured rules.\n\n• **Review draft:** Preview the generated plan with warnings for rule violations, understaffing, or conflicts.\n\n• **Activation:** Promotes a reviewed draft to the active shift plan with one click.\n\n• **Rule configuration:** Defines shift sequences, minimum staffing, blocked periods, and fairness rules.\n\n**Audience:** Team leads and planning managers.",
      },
      /* ── 9  ADMIN SETTINGS (DETAIL) ── */
      {
        title: "Admin settings in detail",
        icon: <Shield className="h-5 w-5 text-sky-400" />,
        highlight: "Admin Settings",
        body: "[tab:Shield:Admin Settings] – Central configuration for the entire system\n\nAdmin settings are organised into **9 specialised tabs**:",
      },
      /* ── 10  PERSONAL SETTINGS ── */
      {
        title: "Your personal settings",
        icon: <UserCog className="h-5 w-5 text-amber-400" />,
        highlight: "Settings",
        body: "Under **Settings** (accessible via your profile menu top right) you will find everything that adapts ODIN to your workflow:\n\n[section:Profile]\n**Profile & competence profile**\nYour name, email, location, and team. Plus your skill profile with ratings for Smart Hand, Trouble Ticket, and Cross Connect – relevant for automatic ticket assignment.\n\n[section:App]\n**App settings**\nLanguage (German/English) and theme (light/dark). Language is stored server-side and applied everywhere – including the TV dashboard and this tutorial.\n\n[section:Notifications]\n**Notifications**\nToggle email notifications, browser notifications, and shift reminders individually.\n\n[section:Shift preferences]\n**Shift plan preferences** (preferred colleagues & shift wishes)\nThis is where it gets personal: you can specify **preferred colleagues** you like working with. You also set your **shift wishes** – e.g. preferred shift times, weekdays, or blocked periods. These preferences feed directly into the automatic shift plan generation.\n\n[section:Ticket preferences]\n**Ticket preferences & workload**\nPreferred ticket types, flexibility, and growth areas. ODIN takes these into account when automatically assigning tickets.\n\n[section:Thresholds]\n**System thresholds**\nPersonal settings for shift warnings, understaffing limits, and wellbeing thresholds.\n\n**Important:** Well-maintained preferences = better automatic planning. Take 5 minutes to set up your profile!",
      },
      /* ── 11  USER MANAGEMENT ── */
      {
        title: "User management & statistics",
        icon: <UsersRound className="h-5 w-5 text-emerald-400" />,
        highlight: "User Management",
        body: "[tab:UsersRound:User Management]\nManages all users, roles, and granular access rights. Each page in ODIN can be individually enabled per role or department.\n\n**Role concept:**\n• **Admin** – Full access to all features\n• **Team lead** – Shift planning, settings, reports\n• **Employee** – Dashboard, tickets, personal settings\n• **Viewer** – Read-only access (e.g. management reports)\n\n**Statistics & metrics:**\n[tab:BarChart2:Team Statistics] show dispatch and closed trends, ticket type distribution, status distribution, and commit health as interactive charts.\n\n**System metrics** in the header: CPU, RAM, DB storage, active connections, online users, and ticket load.",
      },
      /* ── 12  VISION ── */
      {
        title: "Future & vision",
        icon: <Rocket className="h-5 w-5 text-amber-400" />,
        body: "ODIN is continuously evolving. The roadmap includes:\n\n• **Predictive planning** – AI-powered forecasting of ticket volumes and staffing shortages\n• **Extended automation** – Multi-stage assignment logic with escalation rules\n• **Cross-site coordination** – Cross-location shift planning and resource sharing\n• **Reporting engine** – Automated reports for management and compliance\n• **Mobile view** – Optimised interface for on-the-go access\n\n**The goal:** ODIN as the single point of truth for the entire operational business – transparent, automated, and traceable.\n\nThank you for using ODIN. For questions or feedback, use the **feedback button** in the app – we read every message.",
      },
    ],
  },
};

/* ─────────────────────────────────────────────────────────────────────── */
/*  ADMIN TAB DEFINITIONS (for step 9)                                     */
/* ─────────────────────────────────────────────────────────────────────── */

const ADMIN_TABS: Record<LanguageCode, { icon: React.ReactNode; title: string; description: string }[]> = {
  de: [
    { icon: <CalendarClock className="h-4 w-4 text-emerald-400" />, title: "Schichtplanung", description: "DBS-Integration, Überstunden-Limits, Arbeitszeitregeln, Fairness-Einstellungen, Besetzungsregeln und Schichtfolge-Definitionen." },
    { icon: <MessageSquare className="h-4 w-4 text-cyan-400" />, title: "Teams", description: "Webhook-URLs, Graph-Bot-Konfiguration, Kanalzuordnungen, Ruhezeiten und Event-Zuordnungen für Teams-Benachrichtigungen." },
    { icon: <Tv className="h-4 w-4 text-amber-400" />, title: "TV-Konfiguration", description: "Slide-Dauern, Schrift-Skalierung, kompakte Karten, Auto-Scroll, Animationen und Stale-Ticket-Anzeige für das TV-Dashboard." },
    { icon: <Gauge className="h-4 w-4 text-orange-400" />, title: "Schwellenwerte", description: "Crawler-Aktualität, Commit-Risiko, Eskalationszeiten, Unterbesetzungs-Grenzwerte und globale Warn-Schwellen." },
    { icon: <Zap className="h-4 w-4 text-yellow-400" />, title: "Funktionsschalter", description: "Feature-Toggles für einzelne Funktionen wie Handover, Commit Compliance, TV-Modus, Teams-Integration und ODIN-Logik." },
    { icon: <MessageSquare className="h-4 w-4 text-pink-400" />, title: "Feedback", description: "Feedback-System aktivieren/deaktivieren, Screenshot-Uploads erlauben, maximale Dateigröße und eingereichtes Feedback einsehen/verwalten." },
    { icon: <Brain className="h-4 w-4 text-violet-400" />, title: "Auto-Zuweisung", description: "Zuweisungsregeln der ODIN-Engine, Ausschluss-Listen für Mitarbeiter und Queue-Exclusions – das Regelwerk der Automatik." },
    { icon: <Trash2 className="h-4 w-4 text-red-400" />, title: "Wartung", description: "Datenbank-Resets für Ticket- und Logdaten, Audit-Notizen und Sicherheitsphrasen für kritische Operationen." },
    { icon: <History className="h-4 w-4 text-slate-400" />, title: "Audit-Log", description: "Chronologisches Protokoll aller Einstellungsänderungen – wer hat wann welche Einstellung mit welchem Wert geändert." },
  ],
  en: [
    { icon: <CalendarClock className="h-4 w-4 text-emerald-400" />, title: "Shift Planning", description: "DBS integration, overtime limits, work time rules, fairness settings, staffing rules, and shift sequence definitions." },
    { icon: <MessageSquare className="h-4 w-4 text-cyan-400" />, title: "Teams", description: "Webhook URLs, Graph bot configuration, channel mappings, quiet hours, and event mappings for Teams notifications." },
    { icon: <Tv className="h-4 w-4 text-amber-400" />, title: "TV Configuration", description: "Slide durations, font scaling, compact cards, auto-scroll, animations, and stale ticket display for the TV dashboard." },
    { icon: <Gauge className="h-4 w-4 text-orange-400" />, title: "Thresholds", description: "Crawler freshness, commit risk, escalation times, understaffing limits, and global warning thresholds." },
    { icon: <Zap className="h-4 w-4 text-yellow-400" />, title: "Feature Toggles", description: "Feature toggles for individual functions like handover, commit compliance, TV mode, Teams integration, and ODIN logic." },
    { icon: <MessageSquare className="h-4 w-4 text-pink-400" />, title: "Feedback", description: "Enable/disable the feedback system, allow screenshot uploads, set max file size, and review/manage submitted feedback." },
    { icon: <Brain className="h-4 w-4 text-violet-400" />, title: "Auto Assignment", description: "Assignment rules for the ODIN engine, employee exclusion lists, and queue exclusions – the automation rule set." },
    { icon: <Trash2 className="h-4 w-4 text-red-400" />, title: "Maintenance", description: "Database resets for ticket and log data, audit notes, and safety phrases for critical operations." },
    { icon: <History className="h-4 w-4 text-slate-400" />, title: "Audit Log", description: "Chronological log of all configuration changes – who changed which setting to which value and when." },
  ],
};

/* ─────────────────────────────────────────────────────────────────────── */
/*  ICON MAP (for [tab:IconName:Label] syntax)                             */
/* ─────────────────────────────────────────────────────────────────────── */

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard: Layout,
  Calendar,
  FileText,
  Ticket,
  Brain,
  CalendarClock,
  MessageSquare,
  Tv,
  ScrollText,
  FileCheck,
  Shield,
  UsersRound,
  BarChart2,
  Settings2,
  UserCog,
};

/* ─────────────────────────────────────────────────────────────────────── */
/*  MARKDOWN-LIGHT RENDERER (enhanced)                                     */
/* ─────────────────────────────────────────────────────────────────────── */

function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (line.trim() === "") return <div key={i} className="h-1" />;

        // section header [section:Label]
        if (/^\[section:/.test(line.trim())) {
          const label = line.trim().replace(/^\[section:/, "").replace(/\]$/, "");
          return (
            <div key={i} className="mt-4 flex items-center gap-2 pt-2 border-t border-white/8">
              <div className="h-1.5 w-1.5 rounded-full bg-[#00d8ff]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#00d8ff]/70">{label}</span>
            </div>
          );
        }

        // bullet
        if (/^[•\-]\s/.test(line)) {
          const content = line.replace(/^[•\-]\s*/, "");
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-[#00d8ff] mt-0.5 flex-shrink-0">•</span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(content) }} />
            </div>
          );
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(line) }} />;
      })}
    </div>
  );
}

function renderInline(text: string): string {
  // bold
  let out = text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-100 font-semibold">$1</strong>');
  // [tab:IconName:Label] → rendered inline via placeholders (replaced later in React)
  // For HTML output, render a styled badge
  out = out.replace(/\[tab:(\w+):(.+?)\]/g, (_m, _icon, label) => {
    return `<span class="inline-flex items-center gap-1 rounded-md border border-[#00d8ff]/25 bg-[#00d8ff]/8 px-2 py-0.5 text-[11px] font-semibold text-[#00d8ff] mx-0.5 whitespace-nowrap"><svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>${label}</span>`;
  });
  return out;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  WELCOME HERO                                                           */
/* ─────────────────────────────────────────────────────────────────────── */

function WelcomeHero({ step, copy }: { step: TutorialStep; copy: TutorialCopy }) {
  return (
    <div className="space-y-6 overflow-y-auto flex-1 min-h-0 pr-1">
      {/* Hero */}
      <div className="theme-admin-hero relative overflow-hidden rounded-2xl border border-[#00d8ff]/20 p-6">
        {/* Grid bg */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "linear-gradient(rgba(0,216,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,216,255,0.4) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Glow */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#00d8ff]/10 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-blue-500/8 blur-[60px]" />

        <div className="relative flex items-center gap-6">
          <img
            src="/app/ODIN_Logo.png"
            alt="ODIN"
            className="h-24 w-24 object-contain drop-shadow-[0_0_24px_rgba(0,216,255,0.7)] shrink-0"
          />
          <div>
            <h2
              className="text-4xl font-black tracking-[0.2em] uppercase leading-none"
              style={{
                color: "#00d8ff",
                textShadow: "0 0 20px rgba(0,216,255,0.7), 0 0 50px rgba(59,130,246,0.3)",
              }}
            >
              O.D.I.N
            </h2>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#00d8ff]/60">
              Operations Dispatching and Intelligence Node
            </p>
          </div>
        </div>
      </div>

      {/* Content (without the first line which is the subtitle) */}
      <div className="text-sm leading-7 text-muted-foreground">
        <RichText text={step.body.split("\n").slice(2).join("\n")} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  COMPONENT                                                              */
/* ─────────────────────────────────────────────────────────────────────── */

export function AppTutorialDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { language, languages } = useLanguage();
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setSelectedLanguage(null);
      setStepIndex(0);
    }
  }, [open]);

  const effectiveLanguage = selectedLanguage || language;
  const copy = TUTORIAL[effectiveLanguage];

  const currentStep = copy.steps[stepIndex];
  const isLast = stepIndex === copy.steps.length - 1;
  const totalSteps = copy.steps.length;
  const isAdminStep = stepIndex === 9;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="theme-modal-surface sm:max-w-[860px] max-h-[92vh] overflow-hidden flex flex-col border-[#00d8ff]/15">
        {/* Header */}
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00d8ff]/10 border border-[#00d8ff]/20">
              <BookOpen className="h-4 w-4 text-[#00d8ff]" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-foreground">{copy.title}</span>
              {selectedLanguage !== null && (
                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  {copy.progress} {stepIndex + 1} / {totalSteps}
                </span>
              )}
            </div>
            {selectedLanguage !== null && currentStep.highlight && (
              <div className="ml-auto mr-8">
                <TabBadge icon={currentStep.icon} label={currentStep.highlight} />
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {selectedLanguage === null ? (
          /* ── LANGUAGE SELECTION ── */
          <div className="space-y-5 py-2">
            {/* Logo hero */}
            <div className="theme-admin-hero relative overflow-hidden rounded-2xl border border-[#00d8ff]/15 p-8 text-center">
              <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-56 w-56 rounded-full bg-[#00d8ff]/8 blur-[60px]" />
              <img
                src="/app/ODIN_Logo.png"
                alt="ODIN"
                className="relative mx-auto h-20 w-20 object-contain drop-shadow-[0_0_24px_rgba(0,216,255,0.7)]"
              />
              <h2
                className="relative mt-3 text-3xl font-black tracking-[0.25em] uppercase"
                style={{ color: "#00d8ff", textShadow: "0 0 16px rgba(0,216,255,0.6)" }}
              >
                O.D.I.N
              </h2>
              <p className="relative mt-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#00d8ff]/50">
                Operations Dispatching and Intelligence Node
              </p>
            </div>

            <div className="theme-glass-inset rounded-2xl p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Languages className="h-4 w-4 text-[#00d8ff]" />
                {copy.languageTitle}
              </div>
              <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {copy.languageHint}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {languages.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  className="theme-glass-panel rounded-2xl px-5 py-4 text-left transition hover:border-[#00d8ff]/30 hover:bg-[#00d8ff]/[0.06] hover:shadow-[0_0_20px_rgba(0,216,255,0.08)] group"
                  onClick={() => {
                    setSelectedLanguage(option.code);
                    setStepIndex(0);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="scale-150 origin-left">
                      <FlagIcon code={option.code} />
                    </div>
                    <div className="ml-2">
                      <div className="text-sm font-semibold text-foreground transition-colors group-hover:text-[#00d8ff]">
                        {option.nativeLabel}
                      </div>
                      <div className="mt-0.5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {option.shortLabel}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : currentStep.isWelcome ? (
          /* ── WELCOME HERO ── */
          <WelcomeHero step={currentStep} copy={copy} />
        ) : (
          /* ── STEP CONTENT ── */
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1" dir="ltr">
            {/* Step title with icon */}
            <div className="flex items-center gap-3">
              <div className="theme-glass-inset flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                {currentStep.icon}
              </div>
              <h3 className="text-xl font-bold text-foreground">{currentStep.title}</h3>
            </div>

            {/* Step content */}
            <div className="text-sm leading-7 text-muted-foreground">
              <RichText text={currentStep.body} />
            </div>

            {/* Admin settings tab cards (only on step 9) */}
            {isAdminStep && (
              <div className="grid gap-2 sm:grid-cols-2 pt-1">
                {ADMIN_TABS[effectiveLanguage].map((tab, i) => (
                  <AdminTabCard key={i} icon={tab.icon} title={tab.title} description={tab.description} />
                ))}
              </div>
            )}

            {/* Progress bar */}
            <div className="flex items-center gap-1 pt-3">
              {copy.steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStepIndex(i)}
                  className={`h-1.5 flex-1 rounded-full transition-all cursor-pointer hover:opacity-80 ${
                    i <= stepIndex ? "bg-[#00d8ff]" : "bg-border"
                  } ${i === stepIndex ? "shadow-[0_0_8px_rgba(0,216,255,0.5)]" : ""}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 pt-4 sm:justify-between">
          {selectedLanguage === null ? (
            <Button variant="secondary" onClick={() => onOpenChange(false)} className="border-border/70 hover:border-border">
              {copy.close}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="border-border/70 hover:border-border"
                  onClick={() => {
                    if (stepIndex === 0) {
                      setSelectedLanguage(null);
                      return;
                    }
                    setStepIndex((c) => Math.max(0, c - 1));
                  }}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  {copy.back}
                </Button>
                {stepIndex > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onOpenChange(false)}
                  >
                    {copy.skip}
                  </Button>
                )}
              </div>
              <Button
                className="bg-[#00d8ff]/15 border border-[#00d8ff]/30 text-[#00d8ff] hover:bg-[#00d8ff]/25 hover:border-[#00d8ff]/50 font-semibold shadow-[0_0_16px_rgba(0,216,255,0.15)]"
                onClick={() => {
                  if (isLast) {
                    onOpenChange(false);
                    return;
                  }
                  setStepIndex((c) => Math.min(totalSteps - 1, c + 1));
                }}
              >
                {isLast ? copy.finish : copy.next}
                {!isLast ? <ChevronRight className="ml-1 h-4 w-4" /> : null}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
