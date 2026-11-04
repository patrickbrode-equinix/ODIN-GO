/* Shift plan: who may see sick leave and receives the plan notifications. Everybody else only sees "Abwesend". */

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../../api/api";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { PlanNotificationSettings } from "../settings/PlanNotificationSettings";

interface Props { open: boolean; onClose: () => void; isGerman: boolean }

export function SickVisibilityDialog({ open, onClose, isGerman }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [adminIds, setAdminIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setMessage("");
    api.get("/app-settings")
      .then((response) => {
        const settings = response.data || {};
        setEnabled(String(settings["shiftplan.plan_notifications_enabled"] ?? "true") !== "false");
        try {
          const parsed = JSON.parse(String(settings["shiftplan.plan_notify_admin_user_ids"] ?? "[]"));
          setAdminIds(Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0) : []);
        } catch { setAdminIds([]); }
      })
      .catch(() => setMessage(isGerman ? "Einstellungen konnten nicht geladen werden." : "Unable to load the settings."));
  }, [open, isGerman]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.put("/app-settings", {
        "shiftplan.plan_notifications_enabled": enabled,
        "shiftplan.plan_notify_admin_user_ids": JSON.stringify(adminIds),
      });
      onClose();
    } catch {
      setMessage(isGerman ? "Speichern fehlgeschlagen (Admin-Recht nötig)." : "Saving failed (admin permission required).");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-400" />{isGerman ? "Krankmeldungen und Mitteilungen" : "Sick leave and notifications"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isGerman
            ? "Nur Admins und die hier gewählten Personen sehen, dass eine Abwesenheit eine Krankmeldung ist, und erhalten die Mitteilungen zu Planänderungen. Alle anderen sehen im Dienstplan nur „Abwesend“."
            : "Only admins and the people selected here can see that an absence is sick leave and receive plan change notifications. Everybody else only sees “Absent”."}
        </p>
        <PlanNotificationSettings enabled={enabled} adminIds={adminIds} isGerman={isGerman} onChange={(next) => { setEnabled(next.enabled); setAdminIds(next.adminIds); }} />
        {message ? <p role="alert" className="text-sm text-red-300">{message}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{isGerman ? "Abbrechen" : "Cancel"}</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? (isGerman ? "Speichert …" : "Saving …") : (isGerman ? "Speichern" : "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
