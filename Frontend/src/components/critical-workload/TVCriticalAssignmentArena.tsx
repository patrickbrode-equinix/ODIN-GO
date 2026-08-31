import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Disc3, Orbit, Sparkles, Ticket, Trophy, Zap } from 'lucide-react';

import type {
  CriticalWorkloadAssignmentVisualization,
  CriticalWorkloadCandidateEvaluation,
  CriticalWorkloadTicket,
} from '../../types/criticalWorkload';
import type { LanguageCode } from '../../context/LanguageContext';
import { formatBucket, formatCriticalDateTime, formatRemainingTimeMinutes, getCriticalityTone } from './criticalWorkload.shared';

const ARENA_COPY: Partial<Record<LanguageCode, {
  title: string;
  visualOnly: string;
  wheelMode: string;
  slotMode: string;
  assigned: string;
  reasoning: string;
  nextAction: string;
  selectedEngineer: string;
  eligiblePool: string;
  candidateRank: string;
  candidateScore: string;
  whySelected: string;
}>> = {
  de: {
    title: 'ODIN Assignment Arena',
    visualOnly: 'Visualisierung folgt der bereits regelkonform getroffenen ODIN-Entscheidung.',
    wheelMode: 'Wheel of Fortune',
    slotMode: 'Cyber Slot Matrix',
    assigned: 'Zugewiesen',
    reasoning: 'Entscheidungsbegründung',
    nextAction: 'Nächste Aktion',
    selectedEngineer: 'Ausgewählter Engineer',
    eligiblePool: 'Eligible Pool',
    candidateRank: 'Rang',
    candidateScore: 'Score',
    whySelected: 'Auswahlgrund',
  },
  en: {
    title: 'ODIN Assignment Arena',
    visualOnly: 'Visualization follows the already compliant ODIN decision.',
    wheelMode: 'Wheel of Fortune',
    slotMode: 'Cyber Slot Matrix',
    assigned: 'Assigned',
    reasoning: 'Decision reasoning',
    nextAction: 'Next action',
    selectedEngineer: 'Selected engineer',
    eligiblePool: 'Eligible pool',
    candidateRank: 'Rank',
    candidateScore: 'Score',
    whySelected: 'Selection reason',
  },
};

const SPEED_PROFILES = {
  slow: { lead: 500, spin: 3800, settle: 850, turns: 7 },
  normal: { lead: 350, spin: 3000, settle: 780, turns: 6 },
  fast: { lead: 220, spin: 2200, settle: 620, turns: 5 },
} as const;

const CELEBRATION_PARTICLE_COUNT = {
  low: 10,
  medium: 16,
  high: 22,
} as const;

const ARENA_STYLE_TAG = `
@keyframes tv-arena-confetti {
  0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  100% { transform: translate3d(var(--tx), 180px, 0) rotate(540deg); opacity: 0; }
}
@keyframes tv-arena-beam {
  0%, 100% { opacity: 0.3; transform: scaleY(0.85); }
  50% { opacity: 1; transform: scaleY(1.05); }
}
@keyframes tv-arena-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.98); }
  50% { opacity: 1; transform: scale(1.02); }
}
`;

type ArenaPhase = 'intro' | 'spin' | 'reveal' | 'settled';

function getEligibleCandidates(ticket: CriticalWorkloadTicket): CriticalWorkloadCandidateEvaluation[] {
  return ticket.candidateEvaluations.filter((candidate) => {
    const hasName = Boolean(candidate.name && candidate.name.trim());
    return hasName && (candidate.selected || candidate.eligible);
  });
}

function buildReasoningLines(ticket: CriticalWorkloadTicket) {
  const lines = new Set<string>();
  if (ticket.assignmentReasonSummary) lines.add(ticket.assignmentReasonSummary);

  for (const step of ticket.decisionSteps) {
    if (step.status !== 'passed') continue;
    if (step.message) lines.add(step.message);
    else if (step.title) lines.add(step.title);
    if (lines.size >= 5) break;
  }

  return Array.from(lines).slice(0, 5);
}

function WheelArena({
  candidates,
  selectedIndex,
  phase,
  rotation,
  transitionMs,
  ticket,
  locale,
  language,
}: {
  candidates: CriticalWorkloadCandidateEvaluation[];
  selectedIndex: number;
  phase: ArenaPhase;
  rotation: number;
  transitionMs: number;
  ticket: CriticalWorkloadTicket;
  locale: string;
  language: LanguageCode;
}) {
  const pointerGlow = phase === 'settled' ? 'shadow-[0_0_40px_rgba(250,204,21,0.7)]' : 'shadow-[0_0_26px_rgba(34,211,238,0.38)]';
  const segmentAngle = 360 / Math.max(candidates.length, 1);
  const compact = candidates.length > 8;
  const radius = compact ? 170 : 186;
  const chipWidth = compact ? 112 : 144;

  return (
    <div className="relative mx-auto flex h-full w-full max-w-2xl items-center justify-center overflow-hidden rounded-4xl border border-cyan-400/15 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.16),transparent_40%),linear-gradient(180deg,rgba(6,12,28,0.98),rgba(2,6,18,0.98))] p-6">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ animation: 'tv-arena-pulse 2.4s ease-in-out infinite' }} />
      <div className={`absolute left-1/2 top-5 z-30 h-0 w-0 -translate-x-1/2 border-l-22 border-r-22 border-t-28 border-l-transparent border-r-transparent border-t-cyan-300 ${pointerGlow}`} />

      <div className="relative h-120 w-120 max-h-full max-w-full">
        <div className="absolute inset-5 rounded-full border border-cyan-300/15 shadow-[0_0_80px_rgba(34,211,238,0.12)]" />
        <div className="absolute inset-11 rounded-full border border-cyan-400/12" />
        <div
          className="absolute inset-0"
          style={{
            transform: `rotate(${rotation}deg)`,
            transitionProperty: 'transform',
            transitionDuration: `${transitionMs}ms`,
            transitionTimingFunction: phase === 'reveal' || phase === 'settled'
              ? 'cubic-bezier(0.16, 1, 0.3, 1)'
              : 'cubic-bezier(0.2, 0.8, 0, 1)',
          }}
        >
          {candidates.map((candidate, index) => {
            const angle = (segmentAngle * index) - 90;
            const radians = (angle * Math.PI) / 180;
            const x = Math.cos(radians) * radius;
            const y = Math.sin(radians) * radius;
            const isWinner = index === selectedIndex && (phase === 'reveal' || phase === 'settled');

            return (
              <div
                key={`${candidate.employeeId || candidate.name}-${index}`}
                className="absolute"
                style={{
                  left: `calc(50% + ${x}px - ${chipWidth / 2}px)`,
                  top: `calc(50% + ${y}px - 28px)`,
                  width: `${chipWidth}px`,
                }}
              >
                <div
                  className={`rounded-2xl border px-3 py-2 text-center backdrop-blur-md transition ${isWinner ? 'border-amber-300/60 bg-amber-300/20 text-amber-50 shadow-[0_0_36px_rgba(250,204,21,0.35)]' : 'border-white/10 bg-slate-950/75 text-slate-200 shadow-[0_10px_24px_rgba(2,6,23,0.45)]'}`}
                >
                  <div className={`truncate font-black tracking-tight ${compact ? 'text-sm' : 'text-base'}`}>{candidate.name}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    {candidate.selected ? 'ODIN lock' : `Rank ${candidate.finalRank || index + 1}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="absolute inset-[5.6rem] z-20 flex flex-col items-center justify-center rounded-full border border-cyan-400/15 bg-slate-950/92 text-center shadow-[inset_0_0_80px_rgba(8,145,178,0.12)]">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] ${getCriticalityTone(ticket.criticalityLevel, ticket.isTroubleTicket)}`}>
            <Ticket className="h-3.5 w-3.5" />
            {formatBucket(ticket.priorityBucket, language)}
          </div>
          <div className="mt-4 text-3xl font-black tracking-tight text-white">{ticket.ticketNumber || ticket.activityId || ticket.ticketId}</div>
          <div className="mt-2 max-w-60 text-sm text-slate-300">{ticket.systemName || ticket.ticketType}</div>
          <div className="mt-4 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-50">
            {ticket.revisedCommitDate ? formatCriticalDateTime(ticket.revisedCommitDate, locale) : formatRemainingTimeMinutes(ticket.remainingTimeMinutes, language)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlotArena({
  candidates,
  selectedIndex,
  phase,
  translations,
  transitionMs,
}: {
  candidates: CriticalWorkloadCandidateEvaluation[];
  selectedIndex: number;
  phase: ArenaPhase;
  translations: number[];
  transitionMs: number;
}) {
  const itemHeight = 72;
  const repeated = useMemo(() => Array.from({ length: 4 }, () => candidates).flat(), [candidates]);

  return (
    <div className="relative mx-auto flex h-full w-full max-w-2xl items-center justify-center overflow-hidden rounded-4xl border border-fuchsia-400/15 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.18),transparent_35%),linear-gradient(180deg,rgba(10,7,28,0.98),rgba(2,6,18,0.98))] px-6 py-8">
      <div className="absolute inset-x-10 top-1/2 z-20 h-[4.6rem] -translate-y-1/2 rounded-3xl border border-amber-300/20 bg-amber-300/10 shadow-[0_0_40px_rgba(250,204,21,0.15)]" />
      <div className="grid w-full max-w-xl grid-cols-3 gap-4">
        {translations.map((translation, reelIndex) => (
          <div key={reelIndex} className="relative h-60 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-[0_20px_40px_rgba(2,6,23,0.45)]">
            <div
              className="absolute inset-x-0"
              style={{
                transform: `translateY(${translation}px)`,
                transitionProperty: 'transform',
                transitionDuration: `${transitionMs + (reelIndex * 120)}ms`,
                transitionTimingFunction: phase === 'reveal' || phase === 'settled'
                  ? 'cubic-bezier(0.16, 1, 0.3, 1)'
                  : 'cubic-bezier(0.18, 0.88, 0.06, 1)',
              }}
            >
              {repeated.map((candidate, index) => {
                const repeatedIndex = candidates.length * 2 + selectedIndex;
                const isWinner = index === repeatedIndex && (phase === 'reveal' || phase === 'settled');
                return (
                  <div
                    key={`${candidate.employeeId || candidate.name}-${index}`}
                    className={`flex h-18 items-center justify-center border-b border-white/6 px-4 text-center ${isWinner ? 'bg-amber-300/20 text-amber-50' : 'text-slate-200'}`}
                  >
                    <div>
                      <div className="truncate text-lg font-black tracking-tight">{candidate.name}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">Reel {reelIndex + 1}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

class AssignmentArenaBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
}, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode; resetKey: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export function TVCriticalAssignmentArenaBoundary(props: {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
}) {
  return <AssignmentArenaBoundary {...props} />;
}

export function TVCriticalAssignmentArena({
  ticket,
  settings,
  locale,
  language,
  summaryLabel,
}: {
  ticket: CriticalWorkloadTicket;
  settings: CriticalWorkloadAssignmentVisualization;
  locale: string;
  language: LanguageCode;
  summaryLabel: string;
}) {
  const copy = ARENA_COPY[language] || ARENA_COPY.en!;
  const candidates = useMemo(() => getEligibleCandidates(ticket), [ticket]);
  const reasoningLines = useMemo(() => buildReasoningLines(ticket), [ticket]);
  const selectedIndex = useMemo(() => {
    const selectedByFlag = candidates.findIndex((candidate) => candidate.selected);
    if (selectedByFlag >= 0) return selectedByFlag;
    return candidates.findIndex((candidate) => candidate.name === ticket.selectedEngineer?.name);
  }, [candidates, ticket.selectedEngineer?.name]);

  const profile = SPEED_PROFILES[settings.animationSpeed] || SPEED_PROFILES.normal;
  const celebrationCount = CELEBRATION_PARTICLE_COUNT[settings.celebrationIntensity] || CELEBRATION_PARTICLE_COUNT.medium;

  const [phase, setPhase] = useState<ArenaPhase>('intro');
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelTransitionMs, setWheelTransitionMs] = useState(0);
  const [slotTranslations, setSlotTranslations] = useState([0, 0, 0]);
  const [slotTransitionMs, setSlotTransitionMs] = useState(0);

  useEffect(() => {
    if (candidates.length === 0 || selectedIndex < 0) return;

    const itemHeight = 72;
    const segmentAngle = 360 / Math.max(candidates.length, 1);
    const finalWheelRotation = (profile.turns * 360) - (selectedIndex * segmentAngle);
    const overshootWheelRotation = finalWheelRotation + 18;
    const finalSlotTranslation = -(itemHeight * ((candidates.length * 2) + selectedIndex)) + itemHeight;
    const overshootSlotTranslation = finalSlotTranslation + 12;

    const startOffsets = [0, 1, 2].map((reelIndex) => finalSlotTranslation - (itemHeight * candidates.length * (4 + reelIndex)));
    const overshootOffsets = [0, 1, 2].map((reelIndex) => overshootSlotTranslation - (reelIndex * 8));
    const settledOffsets = [0, 1, 2].map((reelIndex) => finalSlotTranslation - (reelIndex * 2));

    setPhase('intro');
    setWheelTransitionMs(0);
    setWheelRotation(0);
    setSlotTransitionMs(0);
    setSlotTranslations(startOffsets);

    const timers: Array<ReturnType<typeof window.setTimeout>> = [];
    timers.push(window.setTimeout(() => {
      setPhase('spin');
      setWheelTransitionMs(profile.spin);
      setWheelRotation(overshootWheelRotation);
      setSlotTransitionMs(profile.spin);
      setSlotTranslations(overshootOffsets);
    }, profile.lead));

    timers.push(window.setTimeout(() => {
      setPhase('reveal');
      setWheelTransitionMs(profile.settle);
      setWheelRotation(finalWheelRotation);
      setSlotTransitionMs(profile.settle);
      setSlotTranslations(settledOffsets);
    }, profile.lead + profile.spin));

    timers.push(window.setTimeout(() => {
      setPhase('settled');
    }, profile.lead + profile.spin + profile.settle));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [candidates, profile.lead, profile.settle, profile.spin, profile.turns, selectedIndex, ticket.ticketId]);

  if (candidates.length === 0 || selectedIndex < 0 || !ticket.selectedEngineer?.name) {
    return null;
  }

  const winner = candidates[selectedIndex];
  const isWheel = settings.mode === 'gamified_wheel';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-4xl border border-white/8 bg-slate-950/60 p-5 shadow-[0_20px_80px_rgba(2,6,23,0.5)] backdrop-blur-md">
      <style>{ARENA_STYLE_TAG}</style>

      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-cyan-200/80">
            <Orbit className="h-4 w-4 text-cyan-300" />
            {copy.title}
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] text-cyan-50">
              {isWheel ? copy.wheelMode : copy.slotMode}
            </span>
          </div>
          <div className="mt-3 max-w-3xl text-sm text-slate-300">{copy.visualOnly}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{copy.eligiblePool}: {candidates.length}</span>
          </div>
        </div>

        <div className="min-w-64 rounded-3xl border border-cyan-400/20 bg-cyan-400/8 px-4 py-4 text-right">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-cyan-200/70">{copy.selectedEngineer}</div>
          <div className="mt-3 text-2xl font-black text-cyan-50">{ticket.selectedEngineer?.name}</div>
          <div className="mt-2 text-sm text-cyan-100/75">{ticket.assignmentReasonSummary || 'ODIN rule lock'}</div>
        </div>
      </div>

      <div className="relative mt-5 min-h-0 flex-1 overflow-hidden">
        {isWheel ? (
          <WheelArena
            candidates={candidates}
            selectedIndex={selectedIndex}
            phase={phase}
            rotation={wheelRotation}
            transitionMs={wheelTransitionMs}
            ticket={ticket}
            locale={locale}
            language={language}
          />
        ) : (
          <SlotArena
            candidates={candidates}
            selectedIndex={selectedIndex}
            phase={phase}
            translations={slotTranslations}
            transitionMs={slotTransitionMs}
          />
        )}

        {phase === 'settled' && settings.confettiEnabled ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {Array.from({ length: celebrationCount }).map((_, index) => {
              const x = (index / Math.max(celebrationCount - 1, 1)) * 100;
              const tx = ((index % 2 === 0 ? -1 : 1) * (40 + (index * 6))) + 'px';
              const delay = `${(index % 6) * 45}ms`;
              const duration = `${900 + ((index % 5) * 120)}ms`;
              const palette = ['#22d3ee', '#38bdf8', '#facc15', '#f472b6'];
              return (
                <span
                  key={index}
                  className="absolute top-12 h-3 w-2 rounded-full"
                  style={{
                    left: `${x}%`,
                    background: palette[index % palette.length],
                    animation: `tv-arena-confetti ${duration} ease-out ${delay} forwards`,
                    ['--tx' as string]: tx,
                  }}
                />
              );
            })}
          </div>
        ) : null}

        {phase === 'settled' ? (
          <div className="pointer-events-none absolute inset-x-12 bottom-6 top-10 rounded-4xl bg-linear-to-b from-cyan-300/0 via-cyan-300/8 to-cyan-300/0" style={{ animation: 'tv-arena-beam 1.2s ease-in-out infinite' }} />
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-amber-300/20 bg-amber-300/8 px-4 py-4">
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-amber-50/80">
            <Trophy className="h-4 w-4 text-amber-300" />
            {copy.assigned}
          </div>
          <div className="mt-3 text-2xl font-black tracking-tight text-white">{winner.name}</div>
          <div className="mt-2 text-sm text-slate-300">{summaryLabel}</div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{copy.nextAction}</div>
              <div className="mt-2 font-semibold text-white">{ticket.nextAction || '—'}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">ETA</div>
              <div className="mt-2 font-semibold text-white">{formatRemainingTimeMinutes(ticket.remainingTimeMinutes, language)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/8 bg-white/3 px-4 py-4">
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-slate-200/80">
            <Sparkles className="h-4 w-4 text-cyan-200" />
            {copy.reasoning}
          </div>

          <div className="mt-4 space-y-2">
            {/* Why this engineer was selected */}
            {winner.reasons.length > 0 ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-50">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200/70 mb-1.5">{copy.whySelected}</div>
                {winner.reasons.map((reason, index) => (
                  <div key={`${ticket.ticketId}-winner-reason-${index}`} className="flex items-start gap-2 mt-1">
                    <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Decision reasoning steps */}
            {reasoningLines.length > 0 ? reasoningLines.map((line, index) => (
              <div key={`${ticket.ticketId}-reason-${index}`} className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-3 text-sm text-slate-200">
                <div className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                  <span>{line}</span>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-white/8 px-4 py-4 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-cyan-300" />
                  <span>{ticket.assignmentReasonSummary || summaryLabel}</span>
                </div>
              </div>
            )}

            {/* Candidate ranking transparency */}
            {candidates.length > 1 ? (
              <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">{copy.eligiblePool} ({candidates.length})</div>
                <div className="space-y-1.5">
                  {candidates.slice(0, 5).map((candidate, index) => (
                    <div key={`${ticket.ticketId}-cand-${candidate.employeeId || index}`} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${index === selectedIndex ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30' : 'bg-white/5 text-slate-400 border border-white/10'}`}>{candidate.finalRank || index + 1}</span>
                        <span className={index === selectedIndex ? 'font-semibold text-white' : 'text-slate-300'}>{candidate.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        {candidate.score != null ? <span>{copy.candidateScore}: {candidate.score}</span> : null}
                        {candidate.reasons.length > 0 ? <span className="max-w-48 truncate text-slate-400">{candidate.reasons[0]}</span> : null}
                      </div>
                    </div>
                  ))}
                  {candidates.length > 5 ? <div className="text-xs text-slate-500 mt-1">+{candidates.length - 5} weitere</div> : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}