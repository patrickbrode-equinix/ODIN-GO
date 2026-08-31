/* ------------------------------------------------ */
/* HANDOVER – FORM                                  */
/* ------------------------------------------------ */

import { useRef, useState, useCallback } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Save, Upload } from "lucide-react";
import { cn } from "../ui/utils";
import { useLanguage } from "../../context/LanguageContext";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

interface Props {
  formData: any;
  setFormData: (v: any) => void;
  uploadQueue: FileList | null;
  setUploadQueue: (f: FileList | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  errors: Record<string, boolean>;
  isSubmitting: boolean;
}

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function getLocalDateTimeValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export function HandoverForm({
  formData,
  setFormData,
  uploadQueue,
  setUploadQueue,
  onSubmit,
  errors,
  isSubmitting,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  /* ------------------------------------------------ */
  /* LOCAL UI STATE                                  */
  /* ------------------------------------------------ */

  const [quickCommitHours, setQuickCommitHours] = useState<number | null>(null);

  /* ------------------------------------------------ */
  /* SAFE FIELD UPDATE                               */
  /* ------------------------------------------------ */

  const updateField = useCallback(
    (key: string, value: any) => {
      setFormData((prev: any) => {
        if (prev[key] === value) return prev;
        return { ...prev, [key]: value };
      });
    },
    [setFormData]
  );

  /* ------------------------------------------------ */
  /* QUICK TIME                                      */
  /* ------------------------------------------------ */

  const addHours = (hours: number) => {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    updateField("commitAt", getLocalDateTimeValue(d));
    setQuickCommitHours(hours);
  };

  /* ------------------------------------------------ */
  /* FILES                                          */
  /* ------------------------------------------------ */

  const clearSelectedFiles = () => {
    setUploadQueue(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ------------------------------------------------ */
  /* UI CLASSES                                      */
  /* ------------------------------------------------ */

  const errorClass = "ring-1 ring-blue-400/60";
  const pillBase =
    "w-auto inline-flex items-center justify-center whitespace-nowrap rounded-xl px-3 py-1.5 text-sm";
  const selectedGlow =
    "ring-2 ring-blue-500/60 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]";
  const fieldBase =
    "mt-1.5 bg-white/5 border-white/10 focus-visible:ring-blue-500/40";

  const areaOptions = ["Other", "Smart Hands", "Trouble Ticket", "Cross Connect"];
  const priorityOptions = [
    { value: "Low", label: "Low" },
    { value: "High", label: "High" },
    { value: "Critical", label: "🔥 Critical" },
  ];

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>{t("handover.formTitle")}</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {Object.keys(errors).length > 0 && (
            <div className="text-sm text-blue-400">
              {t("handover.requiredFields")}
            </div>
          )}

          <div>
            <Label>{t("handover.ticketNumber")}</Label>
            <Input
              className={cn(fieldBase, errors.ticketNumber && errorClass)}
              value={formData.ticketNumber}
              onChange={(e) =>
                updateField("ticketNumber", e.target.value)
              }
            />
          </div>

          <div>
            <Label>{t("handover.customerName")}</Label>
            <Input
              className={cn(fieldBase, errors.customerName && errorClass)}
              value={formData.customerName}
              onChange={(e) =>
                updateField("customerName", e.target.value)
              }
            />
          </div>

          <div>
            <Label>{t("handover.area")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {areaOptions.map((opt) => {
                const selected = formData.area === opt;
                return (
                  <Button
                    key={opt}
                    type="button"
                    variant="outline"
                    className={cn(
                      pillBase,
                      selected &&
                      cn(
                        "bg-blue-600 text-white border-blue-500",
                        selectedGlow
                      )
                    )}
                    onClick={() => updateField("area", opt)}
                  >
                    {opt}
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>{t("handover.type")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {["Workload", "Terminiert", "Other Teams", "Manual"].map((t) => {
                const selected = formData.type === t;
                return (
                  <Button
                    key={t}
                    type="button"
                    variant="outline"
                    className={cn(
                      pillBase,
                      selected &&
                      cn(
                        "bg-blue-600 text-white border-blue-500",
                        selectedGlow
                      )
                    )}
                    onClick={() => updateField("type", t)}
                  >
                    {t}
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>{t("handover.priority")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {priorityOptions.map((opt) => {
                const selected = formData.priority === opt.value;
                return (
                  <Button
                    key={opt.value}
                    type="button"
                    variant="outline"
                    className={cn(
                      pillBase,
                      selected &&
                      cn(
                        "bg-blue-600 text-white border-blue-500",
                        selectedGlow
                      )
                    )}
                    onClick={() =>
                      updateField("priority", opt.value)
                    }
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>{t("handover.commitTime")}</Label>
            <Input
              type="datetime-local"
              className={cn(fieldBase, errors.commitAt && errorClass)}
              value={
                formData.commitAt || getLocalDateTimeValue()
              }
              onChange={(e) => {
                setQuickCommitHours(null);
                updateField("commitAt", e.target.value);
              }}
            />

            <div className="mt-2 flex flex-wrap gap-2">
              {[4, 8, 12, 24].map((h) => {
                const selected = quickCommitHours === h;
                return (
                  <Button
                    key={h}
                    type="button"
                    variant="outline"
                    className={cn(
                      pillBase,
                      selected &&
                      cn(
                        "bg-blue-600 text-white border-blue-500",
                        selectedGlow
                      )
                    )}
                    onClick={() => addHours(h)}
                  >
                    +{h} h
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>{t("handover.description")}</Label>
            <Textarea
              rows={4}
              className={cn(fieldBase, errors.description && errorClass)}
              value={formData.description}
              onChange={(e) =>
                updateField("description", e.target.value)
              }
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => setUploadQueue(e.target.files)}
          />

          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            {t("handover.selectFiles")}
          </Button>

          {uploadQueue && uploadQueue.length > 0 && (
            <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <div className="flex justify-between">
                <span>
                  {uploadQueue.length} {t("handover.filesSelected")}
                </span>
                <button
                  type="button"
                  onClick={clearSelectedFiles}
                  className="text-xs text-white/60"
                >
                  {t("handover.clearSelection")}
                </button>
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            <Save className="w-4 h-4 mr-2" />
            {isSubmitting ? t("common.saving") : t("common.save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
