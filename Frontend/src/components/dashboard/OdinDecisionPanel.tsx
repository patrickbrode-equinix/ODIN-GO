/**
 * OdinDecisionPanel – Premium USP block showing ODIN's assignment logic reasoning.
 * Animated decision flow: Ticket pool → exclusion reasons → assigned employee.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Zap, BarChart3, Server, Target, XCircle, CheckCircle, Users, Radio } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface DecisionFactor {
  label: string;
  value: number; // 0-100
  icon: React.ReactNode;
}

export interface ExcludedCandidate {
  name: string;
  reason: string;
}

export interface AssignmentFeedEntry {
  ticketId: string;
  ticketType: string;
  assignedEmployee: string;
  decidedAtLabel: string;
  isCurrentUser?: boolean;
}

interface OdinDecisionPanelProps {
  ticketId: string;
  ticketType: string;
  assignedEmployee: string;
  confidence: number;
  factors: DecisionFactor[];
  excludedCandidates?: ExcludedCandidate[];
  poolSize?: number;
  assignmentFeed?: AssignmentFeedEntry[];
  shiftLabel?: string | null;
  isLight?: boolean;
  language: "de" | "en";
}

const COPY = {
  de: {
    title: "ODIN LOGIK",
    subtitle: "WARUM DIESE ZUWEISUNG?",
    decision: "Entscheidung",
    assignedTo: "Zugewiesen an",
    confidence: "Konfidenz",
    pool: "Kandidaten-Pool",
    excluded: "Nicht qualifiziert",
    selected: "Ausgewählt",
    shiftAssignments: "Zuweisungen in deiner Schicht",
    shiftAssignmentsEmpty: "Noch keine Zuweisungen in dieser Schicht.",
    nowRunning: "Laufend",
    you: "Du",
    defaultFactors: {
      priority: "Priorität",
      workload: "Aktuelle Auslastung",
      systemMatch: "System Match",
    },
  },
  en: {
    title: "ODIN LOGIC",
    subtitle: "WHY THIS ASSIGNMENT?",
    decision: "Decision",
    assignedTo: "Assigned to",
    confidence: "Confidence",
    pool: "Candidate Pool",
    excluded: "Not qualified",
    selected: "Selected",
    shiftAssignments: "Assignments in your shift",
    shiftAssignmentsEmpty: "No assignments in this shift yet.",
    nowRunning: "Live",
    you: "You",
    defaultFactors: {
      priority: "Priority",
      workload: "Current Workload",
      systemMatch: "System Match",
    },
  },
} as const;

export function OdinDecisionPanel({
  ticketId,
  ticketType,
  assignedEmployee,
  confidence,
  factors,
  excludedCandidates = [],
  poolSize = 8,
  assignmentFeed = [],
  shiftLabel = null,
  isLight = false,
  language,
}: OdinDecisionPanelProps) {
  const copy = COPY[language];
  const [animStep, setAnimStep] = useState(0);
  const [assignmentIndex, setAssignmentIndex] = useState(0);

  const visibleAssignments = useMemo(() => {
    if (assignmentFeed.length === 0) return [] as AssignmentFeedEntry[];
    const count = Math.min(3, assignmentFeed.length);
    return Array.from({ length: count }, (_, offset) => assignmentFeed[(assignmentIndex + offset) % assignmentFeed.length]);
  }, [assignmentFeed, assignmentIndex]);

  // Animated step progression: pool → exclusions → selection
  useEffect(() => {
    const timers = [
      setTimeout(() => setAnimStep(1), 600),
      setTimeout(() => setAnimStep(2), 1400),
      setTimeout(() => setAnimStep(3), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [ticketId]);

  useEffect(() => {
    setAssignmentIndex(0);
    if (assignmentFeed.length <= 1) return undefined;

    const intervalId = window.setInterval(() => {
      setAssignmentIndex((current) => (current + 1) % assignmentFeed.length);
    }, 3200);

    return () => window.clearInterval(intervalId);
  }, [assignmentFeed]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={isLight
        ? "flex flex-col rounded-2xl border border-sky-200/75 bg-[linear-gradient(155deg,rgba(255,255,255,0.82),rgba(239,246,255,0.76)_48%,rgba(248,250,252,0.82))] p-5 shadow-[0_24px_54px_rgba(148,163,184,0.16),0_10px_26px_rgba(56,189,248,0.10)] backdrop-blur-xl"
        : "flex flex-col rounded-2xl border p-5 backdrop-blur-lg"
      }
      style={isLight ? undefined : {
        borderColor: "var(--odin-border-cyan)",
        background: "rgba(5, 16, 32, 0.16)",
        boxShadow: "var(--odin-glow-cyan), inset 0 1px 0 rgba(0,210,255,0.04)",
      }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Brain className={isLight ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-cyan-400"} />
        <div>
          <div className={isLight
            ? "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500"
            : "text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/80"
          }>
            {copy.title}
          </div>
          <div className={isLight
            ? "text-sm font-bold text-slate-800"
            : "text-sm font-bold text-white/90"
          }>
            {copy.subtitle}
          </div>
        </div>
      </div>

      {/* Animated decision flow */}
      <div className={isLight
        ? "mb-4 rounded-xl border border-white/80 bg-white/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_10px_24px_rgba(148,163,184,0.08)]"
        : "mb-4 rounded-xl border border-cyan-400/10 bg-cyan-400/5 p-4"
      }>
        {/* Ticket + ODIN node + Employee */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className={isLight
              ? "text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400"
              : "text-[9px] font-bold uppercase tracking-[0.16em] text-white/40"
            }>
              Ticket
            </div>
            <div className={isLight ? "text-sm font-bold text-slate-900" : "text-sm font-bold text-white"}>
              {ticketId}
            </div>
            <div className={isLight
              ? "text-[10px] font-medium text-slate-500"
              : "text-[10px] font-medium text-white/50"
            }>
              {ticketType}
            </div>
          </div>

          {/* Animated ODIN node with pulse */}
          <motion.div
            className="flex flex-col items-center"
            animate={animStep >= 2 ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <div className={isLight
              ? "flex h-10 w-10 items-center justify-center rounded-full border border-sky-200 bg-sky-50"
              : "flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10"
            } style={isLight ? undefined : { boxShadow: animStep >= 2 ? "0 0 20px rgba(0,210,255,0.35)" : "0 0 12px rgba(0,210,255,0.15)" }}>
              <Zap className={isLight ? "h-4 w-4 text-sky-600" : "h-4 w-4 text-cyan-300"} />
            </div>
            <span className={isLight
              ? "mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-400"
              : "mt-1 text-[8px] font-bold uppercase tracking-wider text-cyan-300/60"
            }>ODIN</span>
          </motion.div>

          {/* Assigned employee (appears in step 3) */}
          <AnimatePresence>
            {animStep >= 3 ? (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
                className="text-right"
              >
                <div className={isLight
                  ? "text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400"
                  : "text-[9px] font-bold uppercase tracking-[0.16em] text-white/40"
                }>
                  {copy.assignedTo}
                </div>
                <div className="mt-0.5 flex items-center justify-end gap-1.5">
                  <span className={isLight ? "text-sm font-bold text-slate-900" : "text-sm font-bold text-white"}>
                    {assignedEmployee}
                  </span>
                  <CheckCircle className={isLight ? "h-3.5 w-3.5 text-emerald-500" : "h-3.5 w-3.5 text-emerald-400"} />
                </div>
              </motion.div>
            ) : (
              <div className="w-24" />
            )}
          </AnimatePresence>
        </div>

        {/* Pool indicator */}
        <AnimatePresence>
          {animStep >= 1 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.3 }}
              className={`mt-3 flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                isLight ? "border border-slate-200/80 bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]" : "bg-cyan-400/5"
              }`}
            >
              <Users className={`h-3.5 w-3.5 ${isLight ? "text-sky-500" : "text-cyan-400/70"}`} />
              <span className={`text-[10px] font-semibold ${isLight ? "text-slate-600" : "text-white/60"}`}>
                {copy.pool}: {poolSize} {language === "de" ? "Techniker verfügbar" : "technicians available"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Excluded candidates */}
        <AnimatePresence>
          {animStep >= 2 && excludedCandidates.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-2 space-y-1"
            >
              <div className={`text-[9px] font-bold uppercase tracking-[0.14em] ${isLight ? "text-red-500/70" : "text-red-400/60"}`}>
                {copy.excluded}:
              </div>
              {excludedCandidates.slice(0, 3).map((candidate, i) => (
                <motion.div
                  key={candidate.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.15 }}
                  className={`flex items-center gap-2 rounded px-2 py-1 ${
                    isLight ? "border border-rose-200/80 bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]" : "bg-red-500/5"
                  }`}
                >
                  <XCircle className={`h-3 w-3 shrink-0 ${isLight ? "text-red-400" : "text-red-400/70"}`} />
                  <span className={`text-[10px] font-semibold ${isLight ? "text-slate-700" : "text-white/65"}`}>{candidate.name}</span>
                  <span className={`ml-auto text-[9px] ${isLight ? "text-slate-400" : "text-white/35"}`}>{candidate.reason}</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Decision factors */}
      <div className="space-y-2.5">
        {factors.map((factor, index) => (
          <div key={index}>
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${
                isLight ? "text-slate-600" : "text-white/70"
              }`}>
                {factor.icon}
                {factor.label}
              </div>
              <span className={`text-[10px] font-bold tabular-nums ${
                isLight ? "text-slate-800" : "text-white/90"
              }`}>
                {factor.value}%
              </span>
            </div>
            <div className={isLight
              ? "mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
              : "mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"
            }>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${factor.value}%` }}
                transition={{ duration: 0.8, delay: 0.3 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className={isLight
                  ? "h-full rounded-full bg-linear-to-r from-sky-400 to-sky-600"
                  : "h-full rounded-full bg-linear-to-r from-cyan-400/80 to-cyan-300/60"
                }
              />
            </div>
          </div>
        ))}
      </div>

      <div className={isLight
        ? "mt-4 rounded-lg border border-white/80 bg-white/74 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_10px_24px_rgba(148,163,184,0.08)]"
        : "mt-4 rounded-lg border border-cyan-400/10 bg-cyan-400/6 px-3 py-2.5"
      }>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className={isLight
              ? "text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"
              : "text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300/72"
            }>
              {copy.shiftAssignments}
            </div>
            {shiftLabel ? (
              <div className={isLight ? "text-[11px] font-semibold text-slate-700" : "text-[11px] font-semibold text-white/70"}>
                {shiftLabel}
              </div>
            ) : null}
          </div>
          <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${
            isLight ? "bg-sky-100 text-sky-700" : "bg-cyan-400/14 text-cyan-200"
          }`}>
            <Radio className="h-3 w-3" />
            {copy.nowRunning}
          </div>
        </div>

        {visibleAssignments.length > 0 ? (
          <div className="space-y-1.5">
            <AnimatePresence mode="popLayout" initial={false}>
              {visibleAssignments.map((entry, index) => (
                <motion.div
                  key={`${entry.ticketId}-${entry.assignedEmployee}-${index}-${assignmentIndex}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, delay: index * 0.04 }}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                    isLight
                      ? entry.isCurrentUser
                        ? "border-sky-200/90 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(240,249,255,0.94))] shadow-[0_12px_26px_rgba(56,189,248,0.10)]"
                        : "border-slate-200/80 bg-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]"
                      : entry.isCurrentUser
                        ? "border-cyan-300/28 bg-cyan-400/10"
                        : "border-white/8 bg-black/10"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[11px] font-bold ${isLight ? "text-slate-900" : "text-white/92"}`}>
                      {entry.ticketId}
                    </div>
                    <div className={`truncate text-[10px] ${isLight ? "text-slate-500" : "text-white/52"}`}>
                      {entry.ticketType}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[10px] font-semibold ${isLight ? "text-slate-700" : "text-white/78"}`}>
                      {entry.assignedEmployee}
                      {entry.isCurrentUser ? ` · ${copy.you}` : ""}
                    </div>
                    <div className={`text-[9px] ${isLight ? "text-slate-400" : "text-white/40"}`}>
                      {entry.decidedAtLabel}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className={isLight ? "text-[11px] text-slate-400" : "text-[11px] text-white/36"}>
            {copy.shiftAssignmentsEmpty}
          </div>
        )}
      </div>

      {/* Confidence bar */}
      <div className={isLight
        ? "mt-4 rounded-lg border border-white/80 bg-white/72 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_10px_24px_rgba(148,163,184,0.08)]"
        : "mt-4 rounded-lg border border-cyan-400/10 bg-cyan-400/5 px-3 py-2"
      }>
        <div className="flex items-center justify-between">
          <span className={isLight
            ? "text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"
            : "text-[10px] font-bold uppercase tracking-[0.14em] text-white/50"
          }>
            {copy.confidence}
          </span>
          <span className={isLight
            ? "text-sm font-black text-slate-900"
            : "text-sm font-black text-cyan-300"
          }>
            {confidence}%
          </span>
        </div>
        <div className={isLight
          ? "mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200"
          : "mt-1.5 h-2 overflow-hidden rounded-full bg-white/10"
        }>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${confidence}%` }}
            transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className={isLight
              ? "h-full rounded-full bg-linear-to-r from-emerald-400 to-sky-500"
              : "h-full rounded-full bg-linear-to-r from-cyan-400 to-emerald-400"
            }
            style={isLight ? undefined : { boxShadow: "0 0 8px rgba(0,210,255,0.3)" }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/** Helper to generate default decision factors (without Skill Match) */
export function getDefaultDecisionFactors(language: "de" | "en"): DecisionFactor[] {
  const labels = COPY[language].defaultFactors;
  return [
    { label: labels.priority, value: 92, icon: <Target className="h-3 w-3" /> },
    { label: labels.workload, value: 74, icon: <BarChart3 className="h-3 w-3" /> },
    { label: labels.systemMatch, value: 81, icon: <Server className="h-3 w-3" /> },
  ];
}

/** Helper to generate example excluded candidates */
export function getDefaultExcludedCandidates(language: "de" | "en"): ExcludedCandidate[] {
  return [
    { name: "M. Schmidt", reason: language === "de" ? "Auslastung 100%" : "Workload 100%" },
    { name: "T. Weber", reason: language === "de" ? "Nicht in Schicht" : "Not on shift" },
    { name: "K. Fischer", reason: language === "de" ? "System-Cluster" : "System cluster" },
  ];
}
