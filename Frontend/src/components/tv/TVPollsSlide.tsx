/* ------------------------------------------------ */
/* TV POLLS SLIDE – Active Umfragen                 */
/* Professional display of active polls on TV       */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { BarChart3, Clock, Users, Vote } from "lucide-react";
import { api } from "../../api/api";

/* ─────────────── Types ─────────────── */

type TvPollOption = {
  option_index: number;
  count: number;
};

type TvPoll = {
  id: number;
  title: string;
  description: string;
  options: string[];
  ends_at: string | null;
  closed: boolean;
  vote_count: number;
  votes: TvPollOption[];
};

/* ─────────────── Helpers ─────────────── */

function formatDeadline(endsAt: string) {
  const d = new Date(endsAt);
  return d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRemainingLabel(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

/* Bar colors – cycle through palette */
const BAR_COLORS = [
  { bar: "bg-[#00d8ff]", shadow: "shadow-[0_0_12px_rgba(0,216,255,0.4)]", text: "text-[#00d8ff]", borderColor: "rgba(0,216,255,0.30)", bgRadial: "rgba(0,216,255,0.12)" },
  { bar: "bg-emerald-400", shadow: "shadow-[0_0_12px_rgba(52,211,153,0.4)]", text: "text-emerald-400", borderColor: "rgba(52,211,153,0.30)", bgRadial: "rgba(52,211,153,0.12)" },
  { bar: "bg-amber-400", shadow: "shadow-[0_0_12px_rgba(251,191,36,0.4)]", text: "text-amber-400", borderColor: "rgba(251,191,36,0.30)", bgRadial: "rgba(251,191,36,0.12)" },
  { bar: "bg-violet-400", shadow: "shadow-[0_0_12px_rgba(167,139,250,0.4)]", text: "text-violet-400", borderColor: "rgba(167,139,250,0.30)", bgRadial: "rgba(167,139,250,0.12)" },
  { bar: "bg-rose-400", shadow: "shadow-[0_0_12px_rgba(251,113,133,0.4)]", text: "text-rose-400", borderColor: "rgba(251,113,133,0.30)", bgRadial: "rgba(251,113,133,0.12)" },
  { bar: "bg-indigo-400", shadow: "shadow-[0_0_12px_rgba(129,140,248,0.4)]", text: "text-indigo-400", borderColor: "rgba(129,140,248,0.30)", bgRadial: "rgba(129,140,248,0.12)" },
];

/* ─────────────── Single Poll Card ─────────────── */

function TvPollCard({ poll, index }: { poll: TvPoll; index: number }) {
  const options: string[] =
    typeof poll.options === "string" ? JSON.parse(poll.options) : poll.options;
  const totalVotes = poll.votes.reduce((s, v) => s + v.count, 0);
  const remaining = poll.ends_at ? getRemainingLabel(poll.ends_at) : null;

  // Find max vote count for winner highlight
  const maxCount = Math.max(...poll.votes.map((v) => v.count), 0);

  return (
    <div className="relative overflow-hidden rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: `linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 16%, rgba(4,9,23,0.94) 52%, rgba(3,8,20,0.98) 100%), radial-gradient(ellipse 80% 60% at 50% 0%, ${BAR_COLORS[(index * 3) % BAR_COLORS.length].bgRadial}, rgba(3,9,24,0.98) 65%)`,
        border: `1px solid ${BAR_COLORS[(index * 3) % BAR_COLORS.length].borderColor}`,
        boxShadow: `0 0 0 1px ${BAR_COLORS[(index * 3) % BAR_COLORS.length].borderColor}30, 0 0 70px ${BAR_COLORS[(index * 3) % BAR_COLORS.length].borderColor}18, 0 20px 56px rgba(0,0,0,0.28), inset 0 1px 0 ${BAR_COLORS[(index * 3) % BAR_COLORS.length].borderColor}20`,
      }}>
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: `linear-gradient(115deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.03) 14%, transparent 30%), radial-gradient(circle at 88% 14%, ${BAR_COLORS[(index * 3) % BAR_COLORS.length].bgRadial}, transparent 32%)`,
        }}
      />
      {/* Neon top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: 1, background: `linear-gradient(90deg, transparent 5%, ${BAR_COLORS[(index * 3) % BAR_COLORS.length].borderColor}60 30%, ${BAR_COLORS[(index * 3) % BAR_COLORS.length].borderColor} 50%, ${BAR_COLORS[(index * 3) % BAR_COLORS.length].borderColor}60 70%, transparent 95%)`, boxShadow: `0 0 8px 1px ${BAR_COLORS[(index * 3) % BAR_COLORS.length].borderColor}40` }} />
      {/* Title & Meta */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[1.35rem] font-black text-white leading-tight truncate" style={{ textShadow: "0 0 18px rgba(255,255,255,0.08)" }}>
            {poll.title}
          </h3>
          {poll.description && (
            <p className="mt-1 text-sm text-slate-400 leading-relaxed line-clamp-2">
              {poll.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5 text-sm text-slate-400">
            <Users className="h-3.5 w-3.5" />
            <span className="font-semibold text-slate-200">{totalVotes}</span>
          </div>
          {remaining && (
            <div className="flex items-center gap-1 text-[11px] text-amber-400/80">
              <Clock className="h-3 w-3" />
              {remaining}
            </div>
          )}
        </div>
      </div>

      {/* Options with bars */}
      <div className="space-y-3">
        {options.map((opt, i) => {
          const voteData = poll.votes.find((v) => v.option_index === i);
          const count = voteData?.count || 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isWinner = count > 0 && count === maxCount;
          const colorIdx = (index * 3 + i) % BAR_COLORS.length;
          const color = BAR_COLORS[colorIdx];

          return (
            <div key={i} className="group">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span
                  className={`text-sm font-medium truncate ${
                    isWinner ? "text-slate-100" : "text-slate-300"
                  }`}
                >
                  {opt}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">{count}</span>
                  <span
                    className={`text-sm font-bold w-12 text-right ${
                      isWinner ? color.text : "text-slate-500"
                    }`}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
              <div className="h-3.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 2px rgba(255,255,255,0.06)" }}>
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${color.bar} ${
                    isWinner ? color.shadow : ""
                  }`}
                  style={{ width: `${pct}%`, boxShadow: isWinner ? undefined : "0 0 18px rgba(255,255,255,0.05)" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {poll.ends_at && (
        <div className="flex items-center gap-1.5 text-[10px] pt-1" style={{ color: "rgba(100,116,139,0.7)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Clock className="h-3 w-3" />
          Abstimmung endet: {formatDeadline(poll.ends_at)}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Main Slide ─────────────── */

export function TVPollsSlide() {
  const [polls, setPolls] = useState<TvPoll[]>([]);

  useEffect(() => {
    const load = () =>
      api
        .get("/tv/polls")
        .then((res) => setPolls(Array.isArray(res.data) ? res.data : []))
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (polls.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 rounded-[26px] border" style={{ color: "rgba(100,116,139,0.5)", background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(3,9,24,0.92) 55%, rgba(2,8,19,0.98) 100%)", borderColor: "rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 60px rgba(0,0,0,0.28)" }}>
        <Vote className="w-16 h-16 opacity-20" />
        <span className="text-2xl font-semibold">Keine aktiven Umfragen</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div
        className="relative mb-5 overflow-hidden rounded-[26px] border px-6 py-5"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.02) 18%, rgba(4,11,26,0.96) 65%, rgba(2,8,20,0.98) 100%)",
          borderColor: "rgba(255,255,255,0.1)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 42px rgba(0,0,0,0.3), 0 0 70px rgba(56,189,248,0.08)",
        }}
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 14%, transparent 30%), radial-gradient(circle at 86% 18%, rgba(56,189,248,0.12), transparent 34%)" }} />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border" style={{ background: "linear-gradient(135deg, rgba(56,189,248,0.28), rgba(56,189,248,0.08))", borderColor: "rgba(56,189,248,0.34)", boxShadow: "0 0 26px rgba(56,189,248,0.22), 0 0 70px rgba(56,189,248,0.1)" }}>
              <BarChart3 className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <div className="text-[15px] font-black uppercase tracking-[0.24em] text-white" style={{ textShadow: "0 0 24px rgba(56,189,248,0.25)" }}>Live Umfragen</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Aktive Stimmungsbilder mit Broadcast-Kontrast</div>
            </div>
          </div>
          <div className="rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.22), rgba(3,9,24,0.95) 80%)", border: "1px solid rgba(56,189,248,0.28)", color: "#bae6fd", boxShadow: "0 0 24px rgba(56,189,248,0.2), 0 0 60px rgba(56,189,248,0.08)" }}>
            {polls.length} aktiv
          </div>
        </div>
      </div>
      <div
        className={`grid gap-4 max-w-full ${
          polls.length === 1
            ? "grid-cols-1 max-w-3xl mx-auto"
            : polls.length === 2
              ? "grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto"
              : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
        }`}
      >
        {polls.map((poll, i) => (
          <TvPollCard key={poll.id} poll={poll} index={i} />
        ))}
      </div>
    </div>
  );
}
