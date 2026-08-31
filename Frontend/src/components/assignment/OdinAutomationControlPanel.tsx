import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Clock, Play, Power, PowerOff, RotateCcw, SkipForward, StopCircle, Zap } from 'lucide-react';

import { useLanguage, type LanguageCode, getLanguageLocale } from '../../context/LanguageContext';
import { useAssignmentStore } from '../../store/assignmentStore';
import { EnterpriseCard } from '../layout/EnterpriseLayout';
import { InfoTooltip } from '../ui/InfoTooltip';
import { AssignmentStatusCards } from './AssignmentStatusCards';

const COPY: Partial<Record<LanguageCode, {
  title: string;
  subtitle: string;
  close: string;
  manualRuns: string;
  dryRun: string;
  shadowRun: string;
  runInProgress: string;
  crawlerOverride: string;
  crawlerOverrideHint: string;
  automation: string;
  disabled: string;
  live: string;
  shadow: string;
  lastStarted: string;
  stopped: string;
  by: string;
  mode: string;
  startShadow: string;
  startLive: string;
  stopAutomation: string;
  confirmShadow: string;
  confirmLive: string;
  confirmStop: string;
  dryRunInfo: string;
  shadowRunInfo: string;
  automationInfo: string;
}>> = {
  de: {
    title: 'Run-Steuerung & Automatik',
    subtitle: 'Dry-Run, Shadow-Run und dauerhafte Engine-Steuerung verbleiben im Admin-ODIN-Bereich.',
    close: 'Schließen',
    manualRuns: 'Manuelle Läufe',
    dryRun: 'Dry-Run',
    shadowRun: 'Shadow-Run',
    runInProgress: 'Lauf läuft',
    crawlerOverride: 'Crawler-Check überspringen',
    crawlerOverrideHint: 'Nur für sichere Prüf- oder Wiederholungsläufe nutzen.',
    automation: 'Automatik',
    disabled: 'Deaktiviert',
    live: 'Live',
    shadow: 'Shadow',
    lastStarted: 'Zuletzt gestartet',
    stopped: 'Gestoppt',
    by: 'durch',
    mode: 'Modus',
    startShadow: 'Shadow-Automatik starten',
    startLive: 'Live-Automatik starten',
    stopAutomation: 'Automatik stoppen',
    confirmShadow: 'Shadow-Automatik wirklich starten?',
    confirmLive: 'Live-Automatik wirklich starten? Diese Aktion wirkt produktiv.',
    confirmStop: 'Automatik wirklich stoppen?',
    dryRunInfo: 'Ein einmaliger Testlauf protokolliert Entscheidungen, nimmt aber keine produktiven Änderungen vor.',
    shadowRunInfo: 'Ein einmaliger Shadow-Run simuliert echte Entscheidungen ohne produktive Ticketzuweisung.',
    automationInfo: 'Aktiviere hier die dauerhafte Shadow- oder Live-Automatik. Live nur nach validiertem Shadow-Betrieb verwenden.',
  },
  en: {
    title: 'Run controls & automation',
    subtitle: 'Dry run, shadow run, and persistent engine control remain inside the Admin ODIN area.',
    close: 'Close',
    manualRuns: 'Manual runs',
    dryRun: 'Dry run',
    shadowRun: 'Shadow run',
    runInProgress: 'Run in progress',
    crawlerOverride: 'Skip crawler check',
    crawlerOverrideHint: 'Use only for controlled validation or reruns.',
    automation: 'Automation',
    disabled: 'Disabled',
    live: 'Live',
    shadow: 'Shadow',
    lastStarted: 'Last started',
    stopped: 'Stopped',
    by: 'by',
    mode: 'Mode',
    startShadow: 'Start shadow automation',
    startLive: 'Start live automation',
    stopAutomation: 'Stop automation',
    confirmShadow: 'Start shadow automation now?',
    confirmLive: 'Start live automation now? This changes productive assignments.',
    confirmStop: 'Stop automation now?',
    dryRunInfo: 'A one-time dry run logs decisions without applying productive changes.',
    shadowRunInfo: 'A one-time shadow run simulates real decisions without changing productive ticket assignments.',
    automationInfo: 'Enable persistent shadow or live automation here. Use live mode only after validating shadow behavior.',
  },
};

export function OdinAutomationControlPanel() {
  const { language } = useLanguage();
  const locale = getLanguageLocale(language);
  const copy = COPY[language] || COPY.en!;

  const {
    health,
    runs,
    executing,
    error,
    fetchHealth,
    fetchRuns,
    executeRun,
    startEngine,
    stopEngine,
    clearError,
  } = useAssignmentStore();

  const [skipCrawler, setSkipCrawler] = useState(false);

  useEffect(() => {
    fetchHealth();
    fetchRuns();
  }, [fetchHealth, fetchRuns]);

  const lastRun = runs[0] || null;
  const engineEnabled = health?.enabled === true;
  const engineMode = health?.mode || 'shadow';

  const statusBadgeClass = useMemo(() => {
    if (!engineEnabled) return 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
    return engineMode === 'live'
      ? 'bg-green-500/20 text-green-300 border-green-500/30'
      : 'bg-amber-500/20 text-amber-200 border-amber-500/30';
  }, [engineEnabled, engineMode]);

  const runEngine = (mode: 'dry-run' | 'shadow') => {
    void executeRun(mode, skipCrawler);
  };

  const handleStartEngine = (mode: 'shadow' | 'live') => {
    const confirmed = window.confirm(mode === 'live' ? copy.confirmLive : copy.confirmShadow);
    if (!confirmed) return;
    void startEngine(mode);
  };

  const handleStopEngine = () => {
    if (!window.confirm(copy.confirmStop)) return;
    void stopEngine();
  };

  return (
    <div className="space-y-4">
      <EnterpriseCard>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{copy.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{copy.subtitle}</p>
          </div>
          <label className="flex items-center gap-2 rounded-full border border-border/40 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={skipCrawler}
              onChange={(event) => setSkipCrawler(event.target.checked)}
              className="h-3.5 w-3.5 rounded"
            />
            <SkipForward className="h-3.5 w-3.5" />
            {copy.crawlerOverride}
          </label>
        </div>
        <div className="mt-2 text-xs text-amber-300/80">{skipCrawler ? copy.crawlerOverrideHint : ''}</div>
      </EnterpriseCard>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <EnterpriseCard>
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{copy.manualRuns}</h3>
            <InfoTooltip title={copy.manualRuns} side="right" align="start" width="w-96">
              <p>{copy.dryRunInfo}</p>
              <p>{copy.shadowRunInfo}</p>
            </InfoTooltip>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => runEngine('dry-run')}
              disabled={executing}
              className="inline-flex items-center gap-2 rounded-md border border-border/40 bg-background/70 px-4 py-2 text-sm text-foreground transition hover:bg-accent disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {copy.dryRun}
            </button>
            <button
              onClick={() => runEngine('shadow')}
              disabled={executing}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {executing ? copy.runInProgress : copy.shadowRun}
            </button>
          </div>
        </EnterpriseCard>

        <EnterpriseCard>
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{copy.automation}</h3>
            <InfoTooltip title={copy.automation} side="right" align="start" width="w-96">
              <p>{copy.automationInfo}</p>
            </InfoTooltip>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${statusBadgeClass}`}>
                  {engineEnabled ? <Zap className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                  {!engineEnabled ? copy.disabled : engineMode === 'live' ? copy.live : copy.shadow}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {health?.lastStartedAt ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {copy.lastStarted}: {new Date(health.lastStartedAt).toLocaleString(locale, { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {health.lastStartedBy ? ` ${copy.by} ${health.lastStartedBy}` : ''}
                  </span>
                ) : null}
                {!engineEnabled && health?.lastStoppedAt ? (
                  <span>
                    {copy.stopped}: {new Date(health.lastStoppedAt).toLocaleString(locale, { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : null}
                <span>{copy.mode}: <strong>{engineMode}</strong></span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!engineEnabled ? (
                <>
                  <button
                    onClick={() => handleStartEngine('shadow')}
                    disabled={executing}
                    className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm text-white transition hover:bg-amber-500 disabled:opacity-50"
                  >
                    <Power className="h-4 w-4" />
                    {copy.startShadow}
                  </button>
                  <button
                    onClick={() => handleStartEngine('live')}
                    disabled={executing}
                    className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm text-white transition hover:bg-green-500 disabled:opacity-50"
                  >
                    <Zap className="h-4 w-4" />
                    {copy.startLive}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStopEngine}
                  disabled={executing}
                  className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  <StopCircle className="h-4 w-4" />
                  {copy.stopAutomation}
                </button>
              )}
            </div>
          </div>
        </EnterpriseCard>
      </div>

      {error ? (
        <EnterpriseCard>
          <div className="flex items-start gap-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="flex-1">{error}</div>
            <button onClick={clearError} className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200/80 hover:text-red-100">{copy.close}</button>
          </div>
        </EnterpriseCard>
      ) : null}

      <AssignmentStatusCards health={health} lastRun={lastRun} />
    </div>
  );
}