/* ------------------------------------------------ */
/* DISPATCHER – SIDE PANEL                          */
/* ------------------------------------------------ */

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

import { DispatcherEmployee, ShiftCode, RoleCode, ROLE_LABELS } from "./dispatcher.types";

/* ------------------------------------------------ */
/* CONSTANTS                                        */
/* ------------------------------------------------ */

const SHIFT_LABELS: Record<ShiftCode, string> = {
  F: "Frühschicht",
  S: "Spätschicht",
  N: "Nachtschicht",
  ABW: "Abwesend / Freischicht",
};

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

type Props = {
  open: boolean;
  employee: DispatcherEmployee | null;
  onClose: () => void;
  onSave: (employee: DispatcherEmployee) => void;
};

export function DispatcherSidePanel({
  open,
  employee,
  onClose,
  onSave,
}: Props) {
  if (!employee) return null;

  const updateShift = (shift: ShiftCode) => {
    onSave({ ...employee, shift });
  };

  const toggleRole = (role: RoleCode) => {
    const hasRole = employee.roles.includes(role);
    onSave({
      ...employee,
      roles: hasRole
        ? employee.roles.filter((r) => r !== role)
        : [...employee.roles, role],
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-90 border-l border-sky-400/16 bg-(--surface-1)/95 backdrop-blur-2xl sm:max-w-105">
        <SheetHeader>
          <SheetTitle>{employee.name}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* SHIFT */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Schicht</Label>
            <Select value={employee.shift} onValueChange={updateShift}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SHIFT_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ROLES */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Rollen</Label>

            <div className="space-y-2">
              {(Object.keys(ROLE_LABELS) as RoleCode[]).map((role) => (
                <div key={role} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                  <Checkbox
                    checked={employee.roles.includes(role)}
                    onCheckedChange={() => toggleRole(role)}
                  />
                  <span className="text-sm text-foreground">{ROLE_LABELS[role]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ACTIONS */}
          <div className="border-t border-white/10 pt-4">
            <Button variant="outline" onClick={onClose} className="w-full border-sky-400/16 bg-sky-400/5 hover:bg-sky-400/10">
              Schließen
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
