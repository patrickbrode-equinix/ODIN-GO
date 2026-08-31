/* ------------------------------------------------ */
/* DISPATCHER – PAGE (FIXED SHIFTS + SIDE PANEL)    */
/* ------------------------------------------------ */

import { useState } from "react";

import { DispatcherColumn } from "./DispatcherColumn";
import { DispatcherSidePanel } from "./DispatcherSidePanel";

import {
  DispatcherEmployee,
  ShiftCode,
} from "./dispatcher.types";

/* ------------------------------------------------ */
/* DEMO DATA                                       */
/* ------------------------------------------------ */

const INITIAL_EMPLOYEES: DispatcherEmployee[] = [
  {
    name: "Max Mustermann",
    shift: "F",
    roles: ["dispatcher"],
  },
  {
    name: "Anna Beispiel",
    shift: "S",
    roles: ["crossconnect", "smarthands"],
  },
  {
    name: "Tom Demo",
    shift: "N",
    roles: ["project"],
  },
  {
    name: "Lisa Frei",
    shift: "ABW",
    roles: [],
  },
];

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export default function DispatcherPage() {
  /* ------------------------------------------------ */
  /* STATE                                           */
  /* ------------------------------------------------ */

  const [employees, setEmployees] =
    useState<DispatcherEmployee[]>(INITIAL_EMPLOYEES);

  const [selected, setSelected] =
    useState<DispatcherEmployee | null>(null);

  /* ------------------------------------------------ */
  /* HANDLERS                                        */
  /* ------------------------------------------------ */

  const onSelect = (employee: DispatcherEmployee) => {
    setSelected(employee);
  };

  const onSave = (updated: DispatcherEmployee) => {
    setEmployees((prev) =>
      prev.map((e) =>
        e.name === updated.name ? updated : e
      )
    );

    setSelected(updated);
  };

  const byShift = (shift: ShiftCode) =>
    employees.filter((e) => e.shift === shift);

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <DispatcherColumn
          shift="F"
          employees={byShift("F")}
          onSelect={onSelect}
        />
        <DispatcherColumn
          shift="S"
          employees={byShift("S")}
          onSelect={onSelect}
        />
        <DispatcherColumn
          shift="N"
          employees={byShift("N")}
          onSelect={onSelect}
        />
        <DispatcherColumn
          shift="ABW"
          employees={byShift("ABW")}
          onSelect={onSelect}
        />
      </div>

      {/* SIDE PANEL */}
      <DispatcherSidePanel
        open={!!selected}
        employee={selected}
        onClose={() => setSelected(null)}
        onSave={onSave}
      />
    </>
  );
}
