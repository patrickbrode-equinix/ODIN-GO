/* ———————————————— */
/* GROUP ACCESS MODAL – ADMIN CONFIG                */
/* ———————————————— */

import { X } from "lucide-react";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useLanguage } from "../../context/LanguageContext";

import { GroupAccessEditor } from "./GroupAccessEditor";

/* ———————————————— */
/* TYPES                                            */
/* ———————————————— */

type GroupAccessModalProps = {
  open: boolean;
  onClose: () => void;
};

/* ———————————————— */
/* COMPONENT                                        */
/* ———————————————— */

export function GroupAccessModal({ open, onClose }: GroupAccessModalProps) {
  const { language, t } = useLanguage();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onMouseDown={onClose}
    >
      <Card
        className="w-full max-w-5xl border border-border/50 bg-background/90 backdrop-blur-xl shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold">{t("groupAccess.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {language === "de"
                ? "Lege pro Abteilung fest, welche Seiten sichtbar sind und welches Level gilt."
                : "Define which pages are visible for each department and which access level applies."}
            </p>
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
          <GroupAccessEditor variant="plain" />
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
