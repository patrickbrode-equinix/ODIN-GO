/* ================================================ */
/* ODIN Logic - Main Page                           */
/* ================================================ */

import { useEffect, useState, lazy, Suspense } from 'react';
import { useAssignmentStore } from '../../store/assignmentStore';
import { AssignmentStatusCards } from '../assignment/AssignmentStatusCards';
import { AssignmentSettingsPanel } from '../assignment/AssignmentSettingsPanel';
import { AssignmentRunTable } from '../assignment/AssignmentRunTable';
import { AssignmentDecisionTable } from '../assignment/AssignmentDecisionTable';
import { AssignmentDecisionDrawer } from '../assignment/AssignmentDecisionDrawer';
import { AssignmentFilters } from '../assignment/AssignmentFilters';
import { InfoTooltip } from '../ui/InfoTooltip';
import { Play, RotateCcw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, AlertCircle, Power, PowerOff, Shield, StopCircle, Zap, Clock, Brain, FileText, SkipForward } from 'lucide-react';
import { EnterprisePageShell, EnterpriseFeatureHero, EnterpriseHeader, EnterpriseCard } from '../layout/EnterpriseLayout';
import { useLanguage, type LanguageCode, getLanguageLocale } from '../../context/LanguageContext';
import { TextRepairBoundary } from '../../utils/textRepair';
import { OdinStartupAnimation } from '../OdinStartupAnimation';

const OdinLogicTree = lazy(() => import('../odinlogic/OdinLogicTree'));
const AssignmentVisualizer = lazy(() => import('../odinlogic/AssignmentVisualizer'));

type TabKey = 'runs' | 'decisions' | 'report' | 'settings' | 'logicTree' | 'visualizer';

const ODIN_ONBOARDING_STORAGE_KEY = 'odin-onboarding-v1';

const ODIN_ONBOARDING_STEPS: Record<LanguageCode, ReadonlyArray<{ title: string; body: string }>> = {
  de: [
    {
      title: 'Willkommen in ODIN',
      body: 'ODIN ist der Arbeitsbereich zum Testen, Validieren und spaeteren Automatisieren des Ticket-Routings. Starte hier immer dann, wenn du verstehen willst, was die Engine getan hat, bevor du produktive Automatisierung aktivierst.',
    },
    {
      title: 'Header und Run-Steuerung',
      body: 'Im Seitenkopf liegen die schnellsten Aktionen. Nutze Dry-Run für einen sicheren Einzeltest, Shadow-Run für eine realistische Simulation und die Automatik-Steuerung darunter erst dann, wenn die Logik stabil ist.',
    },
    {
      title: 'Tabs und Laufanalyse',
      body: 'Runs & Logs zeigt die Historie, Ticketentscheidungen erklärt warum Tickets zugewiesen oder abgelehnt wurden, der Run-Report fasst einen Lauf zusammen und Logikbaum oder Visualizer zeigen dir den Routing-Pfad Schritt fuer Schritt.',
    },
    {
      title: 'Nutzereinstellungen und Feedback',
      body: 'Bevor du der Live-Automatik vertraust, sollten Praeferenzen, Kollegenregeln, Feiertage und Schichteinstellungen gepflegt sein. Wenn etwas falsch aussieht, pruefe zuerst die Laufdetails und passe danach die Regeln an, statt direkt Live zu gehen.',
    },
  ],
  en: [
    {
      title: 'Welcome to ODIN',
      body: 'ODIN is the assignment workspace for testing, validating, and later automating ticket routing. Start here whenever you want to understand what the engine did before enabling productive automation.',
    },
    {
      title: 'Header and run controls',
      body: 'The page header is your fast action area. Use Dry run for a safe one-time test, Shadow run for a realistic simulation, and the automation controls below only after the logic is stable.',
    },
    {
      title: 'Tabs and run analysis',
      body: 'Runs & Logs shows the history, Ticket decisions explains why tickets were or were not assigned, the run report summarizes one run, and the logic tree or visualizer helps you inspect the routing path step by step.',
    },
    {
      title: 'User settings and feedback',
      body: 'Before trusting live automation, make sure user preferences, colleague constraints, holidays, and shift settings are maintained. If something looks wrong, review the run details first and then adjust settings instead of forcing live mode.',
    },
  ],
};

const ODIN_ONBOARDING_DIALOG_COPY: Record<LanguageCode, {
  badge: string;
  skip: string;
  back: string;
  step: string;
  next: string;
  start: string;
}> = {
  de: {
    badge: 'ODIN Einführung',
    skip: 'Überspringen',
    back: 'Zurück',
    step: 'Schritt',
    next: 'Weiter',
    start: 'Loslegen',
  },
  en: {
    badge: 'ODIN onboarding',
    skip: 'Skip',
    back: 'Back',
    step: 'Step',
    next: 'Next',
    start: 'Start working',
  },
};

const ODIN_HELP_COPY: Record<LanguageCode, {
  crawlerOverrideTitle: string;
  dryRunTitle: string;
  dryRunDescription: string;
  dryRunHint: string;
  dryRunOverrideWarning: string;
  shadowRunTitle: string;
  shadowRunDescription: string;
  automaticAssignmentTitle: string;
  automaticAssignmentDescription: string;
  automaticAssignmentDisabled: string;
  automaticAssignmentShadow: string;
  automaticAssignmentLive: string;
  automaticAssignmentDifference: string;
  startShadowTitle: string;
  startShadowDescription: string;
  startShadowRecommendation: string;
  startLiveTitle: string;
  startLiveDescription: string;
  startLivePrerequisite: string;
  startLiveWarning: string;
  stopAutomationTitle: string;
  stopAutomationDescription: string;
  stopAutomationManualRuns: string;
  stopAutomationEffect: string;
}> = {
  de: {
    crawlerOverrideTitle: 'Crawler-Aktualitätsprüfung für Dry- und Shadow-Runs überspringen',
    dryRunTitle: 'Dry-Run',
    dryRunDescription: 'Ein einmaliger Testlauf verarbeitet alle aktuellen Tickets und protokolliert Entscheidungen, nimmt aber keine produktiven Änderungen vor.',
    dryRunHint: 'Nutze diesen Modus nach Regel- oder Konfigurationsänderungen für eine schnelle Sicherheitsprüfung.',
    dryRunOverrideWarning: 'Crawler-Override aktiv: Die Frischeprüfung wird übersprungen. Ergebnisse können auf veralteten Crawler-Daten basieren.',
    shadowRunTitle: 'Shadow-Run',
    shadowRunDescription: 'Ein einmaliger Simulationslauf durchläuft den kompletten Zuweisungsprozess, speichert Entscheidungen, ändert aber keine realen Ticketzuweisungen.',
    automaticAssignmentTitle: 'Automatische Zuweisung',
    automaticAssignmentDescription: 'Hier steuerst du, ob die ODIN-Engine automatisch und dauerhaft Tickets verarbeitet.',
    automaticAssignmentDisabled: 'Deaktiviert: Keine automatischen Zuweisungen. Manuelle Dry-Runs und Shadow-Runs bleiben verfügbar.',
    automaticAssignmentShadow: 'Shadow aktiv: Die Engine läuft automatisch, simuliert Zuweisungen und protokolliert jede Entscheidung, ändert aber keine echten Tickets.',
    automaticAssignmentLive: 'Live aktiv: Die Engine weist Tickets produktiv zu. Änderungen wirken sich direkt auf Mitarbeiter-Zuweisungen aus.',
    automaticAssignmentDifference: 'Unterschied zu den Buttons oben rechts: Dry-Run und Shadow-Run starten jeweils einen einzelnen manuellen Lauf. Die Steuerung hier aktiviert die dauerhafte Automatik.',
    startShadowTitle: 'Shadow-Automatik',
    startShadowDescription: 'Startet die automatische Engine im Shadow-Modus. Zuweisungen werden simuliert und protokolliert, aber nicht produktiv umgesetzt.',
    startShadowRecommendation: 'Empfehlung: Verwende diesen Modus, um die Logik über einen längeren Zeitraum zu validieren, bevor du Live aktivierst.',
    startLiveTitle: 'Live-Automatik',
    startLiveDescription: 'Startet die produktive automatische Zuweisung. Tickets werden tatsaechlich zugewiesen.',
    startLivePrerequisite: 'Beim Wechsel auf Live wird "enableLiveMode" automatisch mit aktiviert.',
    startLiveWarning: 'Warnung: Diesen Modus nur verwenden, wenn die Logik im Shadow-Modus ausreichend validiert wurde.',
    stopAutomationTitle: 'Automatik stoppen',
    stopAutomationDescription: 'Stoppt die automatische Zuweisungslogik. Weitere automatische Runs werden nicht mehr gestartet.',
    stopAutomationManualRuns: 'Manuelle Dry-Runs und Shadow-Runs bleiben jederzeit möglich.',
    stopAutomationEffect: 'Bereits laufende Zuweisungsprozesse werden zu Ende geführt. Neue Läufe starten nicht mehr.',
  },
  en: {
    crawlerOverrideTitle: 'Skip the crawler freshness check for dry runs and shadow runs',
    dryRunTitle: 'Dry run',
    dryRunDescription: 'A one-time test run processes all current tickets and logs decisions without applying any productive changes.',
    dryRunHint: 'Use this mode after rule or configuration changes for a quick safety check.',
    dryRunOverrideWarning: 'Crawler override active: the freshness check is skipped. Results may be based on stale crawler data.',
    shadowRunTitle: 'Shadow run',
    shadowRunDescription: 'A one-time simulation executes the full assignment flow, stores decisions, and leaves real ticket assignments untouched.',
    automaticAssignmentTitle: 'Automatic assignment',
    automaticAssignmentDescription: 'This control determines whether the ODIN engine processes tickets automatically and continuously.',
    automaticAssignmentDisabled: 'Disabled: no automatic assignments. Manual dry runs and shadow runs remain available.',
    automaticAssignmentShadow: 'Shadow active: the engine runs automatically, simulates assignments, and logs every decision without changing real tickets.',
    automaticAssignmentLive: 'Live active: the engine assigns tickets productively. Changes affect employee assignments directly.',
    automaticAssignmentDifference: 'Difference from the buttons in the header: Dry run and Start shadow run each trigger a single manual run. This control enables persistent automation.',
    startShadowTitle: 'Shadow automation',
    startShadowDescription: 'Starts the automatic engine in shadow mode. Assignments are simulated and logged but not applied to real tickets.',
    startShadowRecommendation: 'Recommendation: use this mode to validate the logic over a longer period before enabling live automation.',
    startLiveTitle: 'Live automation',
    startLiveDescription: 'Starts productive automatic assignment. Tickets are assigned for real.',
    startLivePrerequisite: 'When switching to live, "enableLiveMode" is enabled automatically.',
    startLiveWarning: 'Warning: only use this after the logic has been validated sufficiently in shadow mode.',
    stopAutomationTitle: 'Stop automation',
    stopAutomationDescription: 'Stops the automatic assignment logic. No further automatic runs will be started.',
    stopAutomationManualRuns: 'Manual dry runs and shadow runs remain available at any time.',
    stopAutomationEffect: 'Runs that are already in progress will finish. New runs will not start anymore.',
  },
};

/* ---- Safety Confirmation Dialog ---- */
function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, variant, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  const variantColors = {
    danger: { bg: 'bg-red-500/10 border-red-500/30', btn: 'bg-red-600 hover:bg-red-500', icon: 'text-red-400' },
    warning: { bg: 'bg-amber-500/10 border-amber-500/30', btn: 'bg-amber-600 hover:bg-amber-500', icon: 'text-amber-400' },
    info: { bg: 'bg-blue-500/10 border-blue-500/30', btn: 'bg-blue-600 hover:bg-blue-500', icon: 'text-blue-400' },
  };
  const v = variantColors[variant];
  return (
    <TextRepairBoundary>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className={`max-w-md w-full mx-4 rounded-xl border ${v.bg} p-6 shadow-2xl`}>
          <div className="flex items-start gap-3 mb-4">
            <Shield className={`w-6 h-6 ${v.icon} shrink-0 mt-0.5`} />
            <div>
              <h3 className="text-base font-bold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{message}</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onCancel} className="px-4 py-2 text-sm rounded-md border border-border/40 bg-background/60 hover:bg-background/80 text-muted-foreground hover:text-foreground transition">
              {cancelLabel}
            </button>
            <button onClick={onConfirm} className={`px-4 py-2 text-sm rounded-md text-white transition ${v.btn}`}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </TextRepairBoundary>
  );
}

function OdinOnboardingDialog({ open, stepIndex, onNext, onBack, onClose }: {
  open: boolean;
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const { language } = useLanguage();

  if (!open) return null;

  const copy = ODIN_ONBOARDING_DIALOG_COPY[language];
  const steps = ODIN_ONBOARDING_STEPS[language];
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return (
    <TextRepairBoundary>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
        <div className="w-full max-w-2xl rounded-2xl border border-blue-500/25 bg-slate-950/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.7)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-blue-300/70">{copy.badge}</div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-100">{step.title}</h2>
            </div>
            <button onClick={onClose} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:border-white/20 hover:text-white">
              {copy.skip}
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-blue-500/15 bg-blue-500/10 p-5 text-sm leading-7 text-slate-200">
            {step.body}
          </div>

          <div className="mt-5 flex items-center gap-2">
            {steps.map((entry, index) => (
              <div
                key={entry.title}
                className={`h-2 flex-1 rounded-full ${index <= stepIndex ? 'bg-blue-400' : 'bg-white/10'}`}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              onClick={onBack}
              disabled={isFirst}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              {copy.back}
            </button>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{copy.step} {stepIndex + 1} / {steps.length}</div>
            <button
              onClick={isLast ? onClose : onNext}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              {isLast ? copy.start : copy.next}
              {!isLast ? <ChevronRight className="h-4 w-4" /> : null}
            </button>
          </div>
        </div>
      </div>
    </TextRepairBoundary>
  );
}

export default function OdinLogicPage() {
  const { language, t } = useLanguage();
  const locale = getLanguageLocale(language);
  const isGerman = language === 'de';
  const copy = {
    cancel: t('common.cancel'),
    close: t('common.close'),
    loading: t('common.loading'),
    title: t('odin.title'),
    subtitle: t('odin.subtitle'),
    liveConfirmTitle: t('odin.liveConfirmTitle'),
    liveConfirmMessage: t('odin.liveConfirmMessage'),
    liveConfirmButton: t('odin.liveConfirmButton'),
    shadowConfirmTitle: t('odin.shadowConfirmTitle'),
    shadowConfirmMessage: t('odin.shadowConfirmMessage'),
    shadowConfirmButton: t('odin.shadowConfirmButton'),
    stopConfirmTitle: t('odin.stopConfirmTitle'),
    stopConfirmMessage: t('odin.stopConfirmMessage'),
    stopConfirmButton: t('odin.stopConfirmButton'),
    runsTab: t('odin.runsTab'),
    decisionsTab: t('odin.decisionsTab'),
    reportTab: t('odin.reportTab'),
    logicTreeTab: t('odin.logicTreeTab'),
    flowTab: t('odin.flowTab'),
    settingsTab: t('odin.settingsTab'),
    crawlerOverride: t('odin.crawlerOverride'),
    staleData: t('odin.staleData'),
    dryRun: t('odin.dryRun'),
    shadowRun: t('odin.shadowRun'),
    runInProgress: t('odin.runInProgress'),
    automaticAssignment: t('odin.automaticAssignment'),
    disabled: t('odin.disabled'),
    liveActive: t('odin.liveActive'),
    shadowActive: t('odin.shadowActive'),
    lastStarted: t('odin.lastStarted'),
    stopped: t('odin.stopped'),
    by: t('odin.by'),
    mode: t('odin.mode'),
    startShadowAutomation: t('odin.startShadowAutomation'),
    startLiveAutomation: t('odin.startLiveAutomation'),
    stopAutomation: t('odin.stopAutomation'),
    engineSettings: t('odin.engineSettings'),
    selectRunForReport: t('odin.selectRunForReport'),
    loadReport: t('odin.loadReport'),
    validationConsistent: t('odin.validationConsistent'),
    validationInconsistent: t('odin.validationInconsistent'),
    processed: t('odin.processed'),
    assigned: t('odin.assigned'),
    unassigned: t('odin.unassigned'),
    notRelevant: t('odin.notRelevant'),
    crawlerOverrideActive: t('odin.crawlerOverrideActive'),
    crawlerOverrideHint: t('odin.crawlerOverrideHint'),
    assignedTickets: t('odin.assignedTickets'),
    unassignedTickets: t('odin.unassignedTickets'),
    ticket: t('odin.ticket'),
    system: t('odin.system'),
    category: t('odin.category'),
    queue: t('odin.queue'),
    assignedTo: t('odin.assignedTo'),
    reason: t('odin.reason'),
    status: t('odin.status'),
    modeDryRun: t('odin.modeDryRun'),
  };
  const helpCopy = ODIN_HELP_COPY[language];
  const {
    health,
    runs,
    decisions,
    selectedRun,
    filters,
    loading,
    error,
    executing,
    fetchHealth,
    fetchSettings,
    fetchRuns,
    fetchDecisions,
    executeRun,
    startEngine,
    stopEngine,
    clearError,
  } = useAssignmentStore();

  const [tab, setTab] = useState<TabKey>('runs');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skipCrawler, setSkipCrawler] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [runReport, setRunReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'warning' | 'info';
    action: () => void;
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'info', action: () => {} });

  // Initial data load
  useEffect(() => {
    fetchHealth();
    fetchSettings();
    fetchRuns();
  }, []);

  // Reload runs when filters change
  useEffect(() => {
    fetchRuns();
  }, [filters.runMode, filters.runStatus]);

  // Load decisions when a run is selected or filter changes
  useEffect(() => {
    if (selectedRun) {
      fetchDecisions({ runId: selectedRun.id });
    }
  }, [selectedRun, filters.decisionResult]);

  useEffect(() => {
    setRunReport(null);
  }, [selectedRun?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const alreadySeen = window.localStorage.getItem(ODIN_ONBOARDING_STORAGE_KEY);
    if (!alreadySeen) {
      setOnboardingOpen(true);
      setOnboardingStep(0);
    }
  }, []);

  const lastRun = runs.length > 0 ? runs[0] : null;
  const engineEnabled = health?.enabled === true;
  const engineMode = health?.mode || 'shadow';

  /* ---- Engine Control Handlers ---- */
  const handleStartEngine = (mode: 'shadow' | 'live') => {
    if (mode === 'live') {
      setConfirmDialog({
        open: true,
        title: copy.liveConfirmTitle,
        message: copy.liveConfirmMessage,
        confirmLabel: copy.liveConfirmButton,
        variant: 'danger',
        action: () => { startEngine('live'); setConfirmDialog(d => ({ ...d, open: false })); },
      });
    } else {
      setConfirmDialog({
        open: true,
        title: copy.shadowConfirmTitle,
        message: copy.shadowConfirmMessage,
        confirmLabel: copy.shadowConfirmButton,
        variant: 'warning',
        action: () => { startEngine('shadow'); setConfirmDialog(d => ({ ...d, open: false })); },
      });
    }
  };

  const handleStopEngine = () => {
    setConfirmDialog({
      open: true,
      title: copy.stopConfirmTitle,
      message: copy.stopConfirmMessage,
      confirmLabel: copy.stopConfirmButton,
      variant: 'info',
      action: () => { stopEngine(); setConfirmDialog(d => ({ ...d, open: false })); },
    });
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; hint: string }[] = [
    { key: 'runs', label: copy.runsTab, icon: <Clock className="w-3.5 h-3.5" />, hint: isGerman ? 'Alle bisherigen Läufe der Engine mit Zeitstempel und Ergebnis' : 'All past engine runs with timestamp and result' },
    { key: 'decisions', label: selectedRun ? `${copy.decisionsTab} (#${selectedRun.id})` : copy.decisionsTab, icon: <FileText className="w-3.5 h-3.5" />, hint: isGerman ? 'Warum wurde ein Ticket zugewiesen oder abgelehnt?' : 'Why was a ticket assigned or rejected?' },
    { key: 'report', label: selectedRun ? `${copy.reportTab} (#${selectedRun.id})` : copy.reportTab, icon: <RotateCcw className="w-3.5 h-3.5" />, hint: isGerman ? 'Zusammenfassung eines einzelnen Laufs' : 'Summary of a single run' },
    { key: 'logicTree', label: copy.logicTreeTab, icon: <Brain className="w-3.5 h-3.5" />, hint: isGerman ? 'Der vollständige Entscheidungsbaum — Schritt für Schritt erklärt' : 'The full decision tree — explained step by step' },
    { key: 'visualizer', label: copy.flowTab, icon: <Zap className="w-3.5 h-3.5" />, hint: isGerman ? 'Grafische Darstellung des Zuweisungsflusses' : 'Visual representation of the assignment flow' },
    { key: 'settings', label: copy.settingsTab, icon: <Shield className="w-3.5 h-3.5" />, hint: isGerman ? 'Regeln, Schwellenwerte und Verhaltenssteuerung der Engine' : 'Rules, thresholds, and engine behavior controls' },
  ];

  const closeOnboarding = () => {
    setOnboardingOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ODIN_ONBOARDING_STORAGE_KEY, 'seen');
    }
  };

  return (
    <TextRepairBoundary>
      <EnterprisePageShell style={{ maxWidth: 'none' }}>
      <OdinStartupAnimation />
      <OdinOnboardingDialog
        open={onboardingOpen}
        stepIndex={onboardingStep}
        onBack={() => setOnboardingStep((value) => Math.max(value - 1, 0))}
        onNext={() => setOnboardingStep((value) => Math.min(value + 1, ODIN_ONBOARDING_STEPS[language].length - 1))}
        onClose={closeOnboarding}
      />

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={copy.cancel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog(d => ({ ...d, open: false }))}
      />

      {/* Page Header */}
      <EnterpriseHeader
        icon={<Brain className="w-6 h-6 text-blue-400" />}
        title={copy.title}
        subtitle={copy.subtitle}
        rightContent={
          <div className="flex items-center gap-2">
            {/* Crawler Override Toggle */}
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer" title={helpCopy.crawlerOverrideTitle}>
              <input type="checkbox" checked={skipCrawler} onChange={e => setSkipCrawler(e.target.checked)} className="rounded w-3 h-3" />
              <SkipForward className="w-3 h-3" />
              {copy.crawlerOverride}
            </label>
            {skipCrawler && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                <AlertCircle className="h-3 w-3" />
                {copy.staleData}
              </span>
            )}
            <div className="w-px h-6 bg-border/30" />
            <InfoTooltip title={helpCopy.dryRunTitle} side="bottom">
              <p>{helpCopy.dryRunDescription}</p>
              <p>{helpCopy.dryRunHint}</p>
              {skipCrawler && <p className="text-amber-400 mt-1">{helpCopy.dryRunOverrideWarning}</p>}
            </InfoTooltip>
            <button
              onClick={() => executeRun('dry-run', skipCrawler)}
              disabled={executing}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border border-border/40 bg-background/60 hover:bg-background/80 transition text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {copy.dryRun}
            </button>
            <InfoTooltip title={helpCopy.shadowRunTitle} side="bottom">
              <p>{helpCopy.shadowRunDescription}</p>
            </InfoTooltip>
            <button
              onClick={() => executeRun('shadow', skipCrawler)}
              disabled={executing}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {executing ? copy.runInProgress : copy.shadowRun}
            </button>
          </div>
        }
      />

      <EnterpriseFeatureHero
        tone="indigo"
        eyebrow={copy.subtitle}
        title={copy.title}
        description={skipCrawler ? copy.staleData : helpCopy.dryRunDescription}
        metrics={[
          { label: copy.dryRun, value: copy.dryRun },
          { label: copy.shadowRun, value: executing ? copy.runInProgress : copy.shadowRun },
          { label: copy.crawlerOverride, value: skipCrawler ? 'ON' : 'OFF' },
        ]}
      />

      {/* ============================================================= */}
      {/* ENGINE CONTROL PANEL - Start/Stop + Status                     */}
      {/* ============================================================= */}
      <div className={`rounded-xl border p-4 backdrop-blur-sm ${
        engineEnabled
          ? engineMode === 'live'
            ? 'border-green-500/40 bg-green-500/5'
            : 'border-amber-500/40 bg-amber-500/5'
          : 'border-border/40 bg-card/60'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Left: Status */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${
              engineEnabled
                ? engineMode === 'live'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-amber-500/20 text-amber-400'
                : 'bg-zinc-500/20 text-zinc-400'
            }`}>
              {engineEnabled ? <Zap className="w-6 h-6" /> : <PowerOff className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  {copy.automaticAssignment}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  !engineEnabled ? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' :
                  engineMode === 'live' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  engineMode === 'shadow' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                  'bg-blue-500/20 text-blue-400 border-blue-500/30'
                }`}>
                  {!engineEnabled ? copy.disabled : engineMode === 'live' ? copy.liveActive : engineMode === 'shadow' ? copy.shadowActive : copy.modeDryRun}
                </span>
                <InfoTooltip title={helpCopy.automaticAssignmentTitle} side="right" width="w-96">
                  <p>{helpCopy.automaticAssignmentDescription}</p>
                  <p>{helpCopy.automaticAssignmentDisabled}</p>
                  <p>{helpCopy.automaticAssignmentShadow}</p>
                  <p>{helpCopy.automaticAssignmentLive}</p>
                  <p>{helpCopy.automaticAssignmentDifference}</p>
                </InfoTooltip>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {health?.lastStartedAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {copy.lastStarted}: {new Date(health.lastStartedAt).toLocaleString(locale, { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {health.lastStartedBy && <span> {copy.by} {health.lastStartedBy}</span>}
                  </span>
                )}
                {!engineEnabled && health?.lastStoppedAt && (
                  <span className="flex items-center gap-1">
                    {copy.stopped}: {new Date(health.lastStoppedAt).toLocaleString(locale, { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {health.lastStoppedBy && <span> {copy.by} {health.lastStoppedBy}</span>}
                  </span>
                )}
                <span>{copy.mode}: <strong>{engineMode}</strong></span>
              </div>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {!engineEnabled ? (
              <>
                <InfoTooltip title={helpCopy.startShadowTitle} side="bottom">
                  <p>{helpCopy.startShadowDescription}</p>
                  <p>{helpCopy.startShadowRecommendation}</p>
                </InfoTooltip>
                <button
                  onClick={() => handleStartEngine('shadow')}
                  disabled={executing}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white transition disabled:opacity-50"
                >
                  <Power className="w-3.5 h-3.5" />
                  {copy.startShadowAutomation}
                </button>
                <InfoTooltip title={helpCopy.startLiveTitle} side="bottom">
                  <p>{helpCopy.startLiveDescription}</p>
                  <p>{helpCopy.startLivePrerequisite}</p>
                  <p>{helpCopy.startLiveWarning}</p>
                </InfoTooltip>
                <button
                  onClick={() => handleStartEngine('live')}
                  disabled={executing}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-md bg-green-600 hover:bg-green-500 text-white transition disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {copy.startLiveAutomation}
                </button>
              </>
            ) : (
              <>
                <InfoTooltip title={helpCopy.stopAutomationTitle} side="bottom">
                  <p>{helpCopy.stopAutomationDescription}</p>
                  <p>{helpCopy.stopAutomationManualRuns}</p>
                  <p>{helpCopy.stopAutomationEffect}</p>
                </InfoTooltip>
                <button
                  onClick={handleStopEngine}
                  disabled={executing}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white transition disabled:opacity-50"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  {copy.stopAutomation}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-xs underline hover:text-red-300">{copy.close}</button>
        </div>
      )}

      {/* Status Cards */}
      <AssignmentStatusCards health={health} lastRun={lastRun} />

      {/* Collapsible Settings */}
      <div className="rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
        <button
          onClick={() => setSettingsOpen(v => !v)}
          className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-accent/20 transition"
        >
          <span>{copy.engineSettings}</span>
          {settingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {settingsOpen && <AssignmentSettingsPanel />}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 overflow-x-auto border-b border-blue-500/20 px-1 pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            title={t.hint}
            className={`-mb-px shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 ${
              tab === t.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-blue-500/30'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Active tab description */}
      {tabs.find(t => t.key === tab)?.hint && (
        <p className="text-xs text-muted-foreground px-1 -mt-1">
          {tabs.find(t => t.key === tab)!.hint}
        </p>
      )}

      {/* Filters */}
      <AssignmentFilters />

      {/* Tab Content */}
      <EnterpriseCard noPadding>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && tab === 'runs' && <AssignmentRunTable runs={runs} />}

        {!loading && tab === 'decisions' && <AssignmentDecisionTable decisions={decisions} />}

        {!loading && tab === 'logicTree' && (
          <div className="p-4">
            <Suspense fallback={<div className="flex items-center justify-center py-8"><div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" /></div>}>
              <OdinLogicTree />
            </Suspense>
          </div>
        )}

        {!loading && tab === 'visualizer' && (
          <div className="p-4">
            <Suspense fallback={<div className="flex items-center justify-center py-8"><div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" /></div>}>
              <AssignmentVisualizer runs={runs} />
            </Suspense>
          </div>
        )}

        {!loading && tab === 'settings' && <AssignmentSettingsPanel />}

        {/* Run Report Tab */}
        {!loading && tab === 'report' && (
          <div className="p-5 space-y-4">
            {!selectedRun ? (
              <p className="text-sm text-muted-foreground text-center py-8">{copy.selectRunForReport}</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    {copy.reportTab} #{selectedRun.id}
                  </h3>
                  <button
                    onClick={async () => {
                      setReportLoading(true);
                      try {
                        const { AssignmentApi } = await import('../../api/assignment');
                        const data = await AssignmentApi.getRunReport(selectedRun.id);
                        setRunReport(data.report);
                      } catch (e: any) { /* ignore */ }
                      setReportLoading(false);
                    }}
                    disabled={reportLoading}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50"
                  >
                    {reportLoading ? copy.loading : copy.loadReport}
                  </button>
                </div>
                {runReport && (
                  <div className="space-y-4">
                    {/* Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {Object.entries(runReport.summary || {}).map(([key, val]) => (
                        <div key={key} className="rounded-lg border border-border/20 bg-background/40 p-3 text-center">
                          <div className="text-lg font-bold text-foreground">{String(val)}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">{key}</div>
                        </div>
                      ))}
                    </div>

                    {/* Validation */}
                    {runReport.validation && (
                      <div className={`rounded-lg border p-3 ${runReport.validation.countConsistent ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                        <div className="text-xs font-bold mb-1">{runReport.validation.countConsistent ? copy.validationConsistent : copy.validationInconsistent}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {copy.processed}: {runReport.validation.totalProcessed} | {copy.assigned}: {runReport.validation.totalAssigned} | {copy.unassigned}: {runReport.validation.totalUnassigned} | {copy.notRelevant}: {runReport.validation.totalNotRelevant}
                        </div>
                        {runReport.validation.warning && <div className="text-[10px] text-red-400 mt-1">{runReport.validation.warning}</div>}
                      </div>
                    )}

                    {/* Crawler Override Warning */}
                    {runReport.crawlerOverride && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                        <div className="text-xs font-bold text-amber-400">{copy.crawlerOverrideActive}</div>
                        <div className="text-[10px] text-muted-foreground">{copy.crawlerOverrideHint}</div>
                      </div>
                    )}

                    {/* Assigned Tickets */}
                    {runReport.assigned?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-green-400 mb-2">{copy.assignedTickets} ({runReport.assigned.length})</h4>
                        <div className="max-h-64 overflow-auto rounded-lg border border-border/20">
                          <table className="w-full text-xs">
                            <thead><tr className="bg-background/60 text-muted-foreground">
                              <th className="px-3 py-1.5 text-left">{copy.ticket}</th>
                              <th className="px-3 py-1.5 text-left">{copy.system}</th>
                              <th className="px-3 py-1.5 text-left">{copy.category}</th>
                              <th className="px-3 py-1.5 text-left">{copy.queue}</th>
                              <th className="px-3 py-1.5 text-left">{copy.assignedTo}</th>
                              <th className="px-3 py-1.5 text-left">{copy.reason}</th>
                            </tr></thead>
                            <tbody>
                              {runReport.assigned.map((d: any, i: number) => (
                                <tr key={i} className="border-t border-border/10 hover:bg-green-500/5">
                                  <td className="px-3 py-1.5 font-mono">{d.displayTicketNumber}</td>
                                  <td className="px-3 py-1.5">{d.systemName || '-'}</td>
                                  <td className="px-3 py-1.5">{d.ticketCategory || '-'}</td>
                                  <td className="px-3 py-1.5">{d.queueType}</td>
                                  <td className="px-3 py-1.5 font-medium text-green-400">{d.assignedTo}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{d.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Unassigned Tickets */}
                    {runReport.unassigned?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-red-400 mb-2">{copy.unassignedTickets} ({runReport.unassigned.length})</h4>
                        <div className="max-h-64 overflow-auto rounded-lg border border-border/20">
                          <table className="w-full text-xs">
                            <thead><tr className="bg-background/60 text-muted-foreground">
                              <th className="px-3 py-1.5 text-left">{copy.ticket}</th>
                              <th className="px-3 py-1.5 text-left">{copy.system}</th>
                              <th className="px-3 py-1.5 text-left">{copy.category}</th>
                              <th className="px-3 py-1.5 text-left">{copy.queue}</th>
                              <th className="px-3 py-1.5 text-left">{copy.status}</th>
                              <th className="px-3 py-1.5 text-left">{copy.reason}</th>
                            </tr></thead>
                            <tbody>
                              {runReport.unassigned.map((d: any, i: number) => (
                                <tr key={i} className="border-t border-border/10 hover:bg-red-500/5">
                                  <td className="px-3 py-1.5 font-mono">{d.displayTicketNumber}</td>
                                  <td className="px-3 py-1.5">{d.systemName || '-'}</td>
                                  <td className="px-3 py-1.5">{d.ticketCategory || '-'}</td>
                                  <td className="px-3 py-1.5">{d.queueType}</td>
                                  <td className="px-3 py-1.5 text-amber-400">{d.result}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{d.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </EnterpriseCard>

      {/* Decision Drawer */}
      <AssignmentDecisionDrawer />
      </EnterprisePageShell>
    </TextRepairBoundary>
  );
}
