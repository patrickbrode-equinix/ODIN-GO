/* ------------------------------------------------ */
/* DISPATCHER – PAGE                                */
/* WEEK-BASED + REAL SHIFTPLAN DATA + SIDE PANEL    */
/* FIXED COLUMNS: F / S / N / ABW                   */
/* ------------------------------------------------ */

import { useEffect, useMemo, useState } from "react";
import {
  addWeeks,
  subWeeks,
  startOfISOWeek,
  endOfISOWeek,
  getISOWeek,
  format,
} from "date-fns";
import { EnterpriseCard, EnterpriseFeatureHero, EnterprisePageShell } from "../layout/EnterpriseLayout";

import { EARLY_SHIFT_CODES, LATE_SHIFT_CODES, useShiftStore } from "../../store/shiftStore";
import { useDispatcherStore } from "../../store/dispatcherStore";

import { DispatcherHeader } from "../dispatcher/DispatcherHeader";
import { DispatcherColumn } from "../dispatcher/DispatcherColumn";
import { DispatcherSidePanel } from "../dispatcher/DispatcherSidePanel";

import type {
  DispatcherEmployee,
  ShiftCode,
} from "../dispatcher/dispatcher.types";

/* ------------------------------------------------ */
/* SHIFT MAPPING (SHIFTPLAN → FIXED COLUMNS)        */
/* ------------------------------------------------ */

function mapShiftplanCodeToFixedShift(code: string): ShiftCode {
  const c = (code || "").trim().toUpperCase();

  if (c === "ABW" || c === "FS") return "ABW";
  if (c === "N") return "N";

  // Früh / Spät
  if (EARLY_SHIFT_CODES.includes(c as (typeof EARLY_SHIFT_CODES)[number]) || c === "F") return "F";
  if (LATE_SHIFT_CODES.includes(c as (typeof LATE_SHIFT_CODES)[number]) || c === "S") return "S";

  return "F";
}

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function weekKeyFromDate(d: Date) {
  return format(startOfISOWeek(d), "yyyy-MM-dd");
}

function normalizeName(raw: string) {
  return raw.replace(",", "").trim();
}

/* ------------------------------------------------ */
/* PAGE                                             */
/* ------------------------------------------------ */

export default function Dispatcher() {
  /* ------------------------------------------------ */
  /* STORES                                          */
  /* ------------------------------------------------ */

  const schedule = useShiftStore((s) => s.getActiveSchedule());
  const { activeWeek, setWeek } = useDispatcherStore();

  /* ------------------------------------------------ */
/* FORCE CURRENT WEEK ON PAGE LOAD                  */
/* ------------------------------------------------ */

useEffect(() => {
  setWeek(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  /* ------------------------------------------------ */
  /* WEEK STATE                                      */
  /* ------------------------------------------------ */

  const weekDate = activeWeek ? new Date(activeWeek.weekDate) : new Date();
  const weekNumber = getISOWeek(weekDate);
  const weekStart = startOfISOWeek(weekDate);
  const weekEnd = endOfISOWeek(weekDate);

  const key = weekKeyFromDate(weekDate);

  /* ------------------------------------------------ */
  /* LOCAL WEEK DATA                                 */
  /* ------------------------------------------------ */

  const [employeesByWeek, setEmployeesByWeek] = useState<
    Record<string, DispatcherEmployee[]>
  >({});

  const employees = employeesByWeek[key] ?? [];

  /* ------------------------------------------------ */
  /* SIDE PANEL STATE                                */
  /* ------------------------------------------------ */

  const [selected, setSelected] = useState<DispatcherEmployee | null>(null);

  /* ------------------------------------------------ */
/* LOAD FROM SHIFTPLAN (MONTH-SAFE, REAL STRUCTURE) */
/* ------------------------------------------------ */

const loadWeekFromShiftplan = () => {
  const loaded: DispatcherEmployee[] = [];

  Object.entries(schedule).forEach(([rawName, days]) => {
    let current = new Date(weekStart);

    while (current <= weekEnd) {
      const dayOfMonth = current.getDate();

      // WICHTIG: schedule enthält nur den aktuell geladenen Monat
      const code = days?.[dayOfMonth];

      if (code) {
        loaded.push({
          name: normalizeName(rawName),
          shift: mapShiftplanCodeToFixedShift(code),
          roles: [],
        });
        break; // nur einmal pro Woche
      }

      current.setDate(current.getDate() + 1);
    }
  });

  setEmployeesByWeek((prev) => ({
    ...prev,
    [key]: loaded,
  }));

  setSelected(null);
};


  /* ------------------------------------------------ */
  /* AUTO LOAD ON WEEK CHANGE                        */
  /* ------------------------------------------------ */

  useEffect(() => {
    loadWeekFromShiftplan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /* ------------------------------------------------ */
  /* SAVE (SHIFT / ROLES) FROM PANEL                 */
  /* ------------------------------------------------ */

  const onSave = (updated: DispatcherEmployee) => {
    setEmployeesByWeek((prev) => {
      const current = prev[key] ?? [];
      return {
        ...prev,
        [key]: current.map((e) =>
          e.name === updated.name ? updated : e
        ),
      };
    });

    setSelected(updated);
  };

  /* ------------------------------------------------ */
  /* VIEW HELPERS                                    */
  /* ------------------------------------------------ */

  const byShift = (shift: ShiftCode) =>
    employees.filter((e) => e.shift === shift);

  const counts = useMemo(
    () => ({
      F: byShift("F").length,
      S: byShift("S").length,
      N: byShift("N").length,
      ABW: byShift("ABW").length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees]
  );

  /* ------------------------------------------------ */
  /* RENDER                                         */
  /* ------------------------------------------------ */

  return (
    <EnterprisePageShell>
      {/* HEADER */}
      <DispatcherHeader
        weekDate={weekDate}
        onPrevWeek={() => setWeek(subWeeks(weekDate, 1))}
        onNextWeek={() => setWeek(addWeeks(weekDate, 1))}
      />

      <EnterpriseFeatureHero
        tone="cyan"
        eyebrow="Shift orchestration"
        title="Dispatcher Console"
        description="Wochenlage, Besetzung je Schicht und direkte Bearbeitung laufen in einer verdichteten Leitstandansicht zusammen."
        metrics={[
          { label: "KW", value: weekNumber },
          { label: "Besetzung", value: employees.length },
          { label: "Zeitraum", value: `${format(weekStart, "dd.MM")} - ${format(weekEnd, "dd.MM")}` },
        ]}
      />

      {/* INFO LINE */}
      <EnterpriseCard>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: "KW", value: String(weekNumber), color: "text-sky-300 border-sky-400/20 bg-sky-400/10" },
            { label: "Zeitraum", value: `${format(weekStart, "dd.MM.yyyy")} – ${format(weekEnd, "dd.MM.yyyy")}`, color: "text-foreground border-white/10 bg-white/5" },
            { label: "Früh", value: String(counts.F), color: "text-orange-300 border-orange-400/20 bg-orange-400/10" },
            { label: "Spät", value: String(counts.S), color: "text-yellow-300 border-yellow-400/20 bg-yellow-400/10" },
            { label: "Nacht", value: String(counts.N), color: "text-sky-300 border-sky-400/20 bg-sky-400/10" },
            { label: "Abwesend", value: String(counts.ABW), color: "text-slate-300 border-slate-400/20 bg-slate-400/10" },
          ].map((item) => (
            <div
              key={item.label}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${item.color}`}
            >
              <span className="uppercase tracking-[0.18em] opacity-80">{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      </EnterpriseCard>

      {/* COLUMNS */}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <DispatcherColumn shift="F" employees={byShift("F")} onSelect={setSelected} />
        <DispatcherColumn shift="S" employees={byShift("S")} onSelect={setSelected} />
        <DispatcherColumn shift="N" employees={byShift("N")} onSelect={setSelected} />
        <DispatcherColumn
          shift="ABW"
          employees={byShift("ABW")}
          onSelect={setSelected}
        />
      </div>

      {/* SIDE PANEL */}
      <DispatcherSidePanel
        open={!!selected}
        employee={selected}
        onClose={() => setSelected(null)}
        onSave={onSave}
      />
    </EnterprisePageShell>
  );
}
