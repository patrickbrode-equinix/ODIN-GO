/* ------------------------------------------------ */
/* DISPATCHER – SHIFT COLUMN                        */
/* ------------------------------------------------ */

import { DispatcherEmployee, ShiftCode } from "./dispatcher.types";
import { DispatcherPersonCard } from "./DispatcherPersonCard";
import { EnterpriseCard } from "../layout/EnterpriseLayout";

/* ------------------------------------------------ */
/* SHIFT LABELS                                     */
/* ------------------------------------------------ */

const SHIFT_LABELS: Record<ShiftCode, string> = {
  F: "Frühschicht",
  S: "Spätschicht",
  N: "Nachtschicht",
  ABW: "Abwesend / Freischicht",
};

const SHIFT_ACCENTS: Record<ShiftCode, { hex: string; badge: string }> = {
  F: { hex: "#fb923c", badge: "text-orange-300 border-orange-400/20 bg-orange-400/10" },
  S: { hex: "#facc15", badge: "text-yellow-300 border-yellow-400/20 bg-yellow-400/10" },
  N: { hex: "#38bdf8", badge: "text-sky-300 border-sky-400/20 bg-sky-400/10" },
  ABW: { hex: "#94a3b8", badge: "text-slate-300 border-slate-400/20 bg-slate-400/10" },
};

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

type Props = {
  shift: ShiftCode;
  employees: DispatcherEmployee[];
  onSelect: (employee: DispatcherEmployee) => void;
};

export function DispatcherColumn({
  shift,
  employees,
  onSelect,
}: Props) {
  const accent = SHIFT_ACCENTS[shift];

  return (
    <EnterpriseCard className="flex h-full min-h-[280px] flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: `${accent.hex}cc` }}>
            Dispatcher
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {SHIFT_LABELS[shift]}
          </div>
        </div>
        <span className={`inline-flex min-w-10 items-center justify-center rounded-full border px-3 py-1 text-[11px] font-bold ${accent.badge}`}>
          {employees.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {employees.length ? employees.map((employee) => (
          <DispatcherPersonCard
            key={employee.name}
            employee={employee}
            onSelect={onSelect}
          />
        )) : (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-muted-foreground">
            Keine Mitarbeitenden für diese Schicht in der ausgewählten Woche.
          </div>
        )}
      </div>
    </EnterpriseCard>
  );
}
