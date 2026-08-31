/* ———————————————————————————————— */
/* COMMIT – MANAGE SAVED FILTERS MODAL (GLOBAL)    */
/* Backend driven via /api/commit/filters          */
/* ———————————————————————————————— */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Trash2, Plus } from "lucide-react";
import { api } from "../../api/api";
import { useCommitStore } from "../../store/commitStore";
import { useLanguage } from "../../context/LanguageContext";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

type SavedFilter = {
  id: string;
  label: string;
  field: string;
  operator: "IN" | "NOT_IN";
  values: string[];
  enabled: boolean;
};

/* ------------------------------------------------ */
/* CONFIG                                           */
/* ------------------------------------------------ */

const FILTER_FIELDS = [
  { key: "ibx", label: "IBX" },
  { key: "systemName", label: "System Name" },
  { key: "group", label: "Group" },
  { key: "salesOrder", label: "Sales Order" },
  { key: "activityNumber", label: "Activity #" },
  { key: "activityType", label: "Activity Type" },
  { key: "activitySubType", label: "Activity Sub-Type" },
  { key: "product", label: "Product" },
  { key: "serialNumber", label: "Serial #" },
  { key: "activityStatus", label: "Status" },
  { key: "owner", label: "Owner" },
];

function getFieldLabel(key: string, language: "de" | "en") {
  const labels: Record<string, { de: string; en: string }> = {
    ibx: { de: "IBX", en: "IBX" },
    systemName: { de: "Systemname", en: "System name" },
    group: { de: "Gruppe", en: "Group" },
    salesOrder: { de: "Sales Order", en: "Sales order" },
    activityNumber: { de: "Aktivität #", en: "Activity #" },
    activityType: { de: "Aktivitätstyp", en: "Activity type" },
    activitySubType: { de: "Aktivitäts-Subtyp", en: "Activity sub-type" },
    product: { de: "Produkt", en: "Product" },
    serialNumber: { de: "Seriennr.", en: "Serial #" },
    activityStatus: { de: "Status", en: "Status" },
    owner: { de: "Owner", en: "Owner" },
  };
  return labels[key]?.[language] ?? key;
}

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export function ManageCommitFiltersModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { language } = useLanguage();
  const registry = useCommitStore((s) => s.registry);

  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(false);

  const [draft, setDraft] = useState<{
    label: string;
    field: string;
    values: string[];
  }>({
    label: "",
    field: "ibx",
    values: [],
  });

  const copy = language === "de"
    ? {
        title: "Commit-Filter global verwalten",
        createNew: "Neuen Filter anlegen",
        placeholder: "Button-Name (z. B. FR2, Product: Core)",
        add: "Hinzufügen",
        saved: "Gespeicherte Filter",
        loading: "Lade…",
        deleteConfirm: "Filter wirklich löschen?",
      }
    : {
        title: "Manage commit filters globally",
        createNew: "Create new filter",
        placeholder: "Button name (e.g. FR2, Product: Core)",
        add: "Add",
        saved: "Saved filters",
        loading: "Loading…",
        deleteConfirm: "Delete this filter?",
      };

  /* ------------------------------------------------ */
  /* LOAD FILTERS                                    */
  /* ------------------------------------------------ */

  async function loadFilters() {
    setLoading(true);
    try {
      const { data } = await api.get("/commit/filters");
      setFilters(data ?? []);
    } catch (err) {
      console.error("Load commit filters failed:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) loadFilters();
  }, [open]);

  /* ------------------------------------------------ */
  /* CREATE FILTER                                   */
  /* ------------------------------------------------ */

  async function createFilter() {
    if (!draft.label || !draft.values.length) return;

    try {
      await api.post("/commit/filters", {
        label: draft.label,
        field: draft.field,
        operator: "IN",
        values: draft.values,
      });

      setDraft({ label: "", field: "ibx", values: [] });
      await loadFilters();
    } catch (err) {
      console.error("Create filter failed:", err);
    }
  }

  /* ------------------------------------------------ */
  /* DELETE FILTER                                   */
  /* ------------------------------------------------ */

  async function deleteFilter(id: string) {
    if (!confirm(copy.deleteConfirm)) return;

    try {
      await api.delete(`/commit/filters/${id}`);
      await loadFilters();
    } catch (err) {
      console.error("Delete filter failed:", err);
    }
  }

  /* ------------------------------------------------ */
  /* REGISTRY VALUES FOR FIELD                       */
  /* ------------------------------------------------ */

  const registryValues =
    (registry as Record<string, { value: string }[]>)[draft.field] ?? [];

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>

        {/* ================= CREATE ================= */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="font-medium">{copy.createNew}</div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              placeholder={copy.placeholder}
              value={draft.label}
              onChange={(e) =>
                setDraft({ ...draft, label: e.target.value })
              }
            />

            <select
              className="h-9 rounded-md border px-2"
              value={draft.field}
              onChange={(e) =>
                setDraft({ ...draft, field: e.target.value, values: [] })
              }
            >
              {FILTER_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>
                  {getFieldLabel(f.key, language as "de" | "en")}
                </option>
              ))}
            </select>

            <Button onClick={createFilter}>
              <Plus className="w-4 h-4 mr-2" />
              {copy.add}
            </Button>
          </div>

          {/* VALUES */}
          <div className="flex flex-wrap gap-2">
            {registryValues.map((v: any) => {
              const active = draft.values.includes(v.value);

              return (
                <button
                  key={v.value}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      values: active
                        ? draft.values.filter((x) => x !== v.value)
                        : [...draft.values, v.value],
                    })
                  }
                  className={`px-3 py-1 rounded-full text-sm border transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-accent"
                  }`}
                >
                  {v.value}
                </button>
              );
            })}
          </div>
        </div>

        {/* ================= LIST ================= */}
        <div className="space-y-2">
          <div className="font-medium">{copy.saved}</div>

          {loading && (
            <div className="text-sm text-muted-foreground">{copy.loading}</div>
          )}

          {filters.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between border rounded-lg px-3 py-2"
            >
              <div>
                <div className="font-medium">{f.label}</div>
                <div className="text-xs text-muted-foreground">
                  {f.field} ∈ {f.values.join(", ")}
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteFilter(f.id)}
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
