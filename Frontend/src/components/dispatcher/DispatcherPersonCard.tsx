/* ------------------------------------------------ */
/* DISPATCHER – PERSON CARD                         */
/* ------------------------------------------------ */

import { DispatcherEmployee, ShiftCode } from "./dispatcher.types";
import {
  Sun,
  Sunset,
  Moon,
  Ban,
} from "lucide-react";

/* ------------------------------------------------ */
/* ROLE LABELS                                      */
/* ------------------------------------------------ */

const ROLE_LABELS: Record<string, string> = {
  dispatcher: "Dispatcher",
  crossconnect: "Crossconnect",
  smarthands: "Smart Hands",
  project: "Projekt",
};

/* ------------------------------------------------ */
/* SHIFT ICONS + COLORS                             */
/* ------------------------------------------------ */

const SHIFT_META: Record<
  ShiftCode,
  { icon: React.ElementType; className: string; border: string; glow: string; badge: string }
> = {
  F: { icon: Sun, className: "text-orange-400", border: "rgba(251,146,60,0.22)", glow: "rgba(251,146,60,0.14)", badge: "border-orange-400/20 bg-orange-400/10 text-orange-300" },
  S: { icon: Sunset, className: "text-yellow-400", border: "rgba(250,204,21,0.22)", glow: "rgba(250,204,21,0.14)", badge: "border-yellow-400/20 bg-yellow-400/10 text-yellow-300" },
  N: { icon: Moon, className: "text-sky-400", border: "rgba(56,189,248,0.22)", glow: "rgba(56,189,248,0.14)", badge: "border-sky-400/20 bg-sky-400/10 text-sky-300" },
  ABW: { icon: Ban, className: "text-slate-400", border: "rgba(148,163,184,0.18)", glow: "rgba(148,163,184,0.12)", badge: "border-slate-400/20 bg-slate-400/10 text-slate-300" },
};

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

type Props = {
  employee: DispatcherEmployee;
  onSelect: (employee: DispatcherEmployee) => void;
};

export function DispatcherPersonCard({ employee, onSelect }: Props) {
  const meta = SHIFT_META[employee.shift];
  const ShiftIcon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(employee)}
      className="group w-full rounded-2xl border px-3 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-400/20"
      style={{
        background: "var(--surface-elevated)",
        borderColor: meta.border,
        boxShadow: `inset 0 1px 0 ${meta.glow}`,
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {employee.name}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {employee.roles.length ? employee.roles.map((role) => (
              <span key={role} className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                {ROLE_LABELS[role] ?? role}
              </span>
            )) : (
              <span className="text-[11px] text-muted-foreground">Noch keine Rolle zugewiesen</span>
            )}
          </div>
        </div>

        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
          style={{ borderColor: meta.border, background: meta.glow }}
        >
          <ShiftIcon className={`h-5 w-5 shrink-0 ${meta.className}`} />
        </div>
      </div>
    </button>
  );
}
