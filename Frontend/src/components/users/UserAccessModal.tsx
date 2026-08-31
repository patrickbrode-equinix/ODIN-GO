/* ———————————————— */
/* USER ACCESS MODAL – PER USER OVERRIDES           */
/* ———————————————— */

import { X } from "lucide-react";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useLanguage } from "../../context/LanguageContext";

import { UserAccessEditor } from "./UserAccessEditor";

/* ———————————————— */
/* TYPES                                            */
/* ———————————————— */

type UserAccessModalProps = {
  open: boolean;
  onClose: () => void;
  user: {
    id: number;
    loginName?: string | null;
    email?: string | null;
    group: string;
    role?: string; // optional: falls Users.tsx es mitliefert
  } | null;
};

/* ———————————————— */
/* COMPONENT                                        */
/* ———————————————— */

export function UserAccessModal({ open, onClose, user }: UserAccessModalProps) {
  const { language, t } = useLanguage();

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-3xl border-border bg-background shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/50">
          <div>
            <CardTitle>{language === "de" ? `${t("userAccess.title")} (Overrides)` : `${t("userAccess.title")} (overrides)`}</CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">
              {user.loginName || user.email || "-"} • {user.group}
              {user.role ? <span> • {user.role}</span> : null}
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>

        <CardContent className="max-h-[75vh] overflow-auto space-y-4">
          <UserAccessEditor userId={user.id} userEmail={user.loginName || user.email || "-"} userGroup={user.group} />
        </CardContent>

        <div className="flex justify-end gap-3 border-t border-border/50 p-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
