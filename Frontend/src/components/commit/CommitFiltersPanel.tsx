/* ------------------------------------------------ */
/* COMMIT – FILTERS PANEL (STICKY + EDIT WORKFLOW)  */
/* ------------------------------------------------ */

import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus, Save, X, CheckCircle2 } from "lucide-react";
import { api } from "../../api/api";
import { useCommitStore } from "../../store/commitStore";
import { useLanguage } from "../../context/LanguageContext";

/* UI */
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

type FilterRule = {
  field: string;
  values: string[];
};

type SavedFilter = {
  id: string;
  label: string;
  rules: FilterRule[];
};

/* ------------------------------------------------ */
/* CONFIG                                           */
/* ------------------------------------------------ */

const FILTER_FIELDS: Array<{ key: string; label: string }> = [
  { key: "ibx", label: "IBX" },
  { key: "group", label: "Group" },
  { key: "activityType", label: "Type" },
  { key: "activitySubType", label: "Sub-Type" },
  { key: "product", label: "Product" },
  { key: "activityStatus", label: "Status" },
];

function getFieldLabel(key: string, language: "de" | "en") {
  const labels: Record<string, { de: string; en: string }> = {
    ibx: { de: "IBX", en: "IBX" },
    group: { de: "Gruppe", en: "Group" },
    activityType: { de: "Typ", en: "Type" },
    activitySubType: { de: "Subtyp", en: "Sub-type" },
    product: { de: "Produkt", en: "Product" },
    activityStatus: { de: "Status", en: "Status" },
  };
  return labels[key]?.[language] ?? key;
}

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function rulesToMap(rules?: FilterRule[]) {
  const map: Record<string, string[]> = {};
  (rules ?? []).forEach((r) => {
    if (!r?.field) return;
    map[r.field] = Array.isArray(r.values) ? r.values : [];
  });
  return map;
}

function shallowEqualRules(
  a: Record<string, string[]>,
  b: Record<string, string[]>
) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = a[k] ?? [];
    const bv = b[k] ?? [];
    if (av.length !== bv.length) return false;

    const as = [...av].sort();
    const bs = [...bv].sort();
    for (let i = 0; i < as.length; i++) {
      if (as[i] !== bs[i]) return false;
    }
  }
  return true;
}

function buildRulesFromMap(map: Record<string, string[]>) {
  return Object.entries(map)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => ({ field, values }));
}

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export function CommitFiltersPanel() {
  const { language } = useLanguage();
  const registry = useCommitStore((s) => s.registry);
  const setStoreFilters = useCommitStore((s) => s.setFilters);

  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(false);

  // editor state
  const [draftLabel, setDraftLabel] = useState("");
  const [draftRules, setDraftRules] = useState<Record<string, string[]>>({});

  // which saved filter is currently "loaded" into editor
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);

  // cache per saved filter, so switching away/back doesn't lose unsaved changes
  const [draftCache, setDraftCache] = useState<
    Record<string, { label: string; rules: Record<string, string[]> }>
  >({});

  // feedback / UX
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const copy = language === "de"
    ? {
        confirmDelete: "Filter wirklich löschen?",
        saved: "Filter gespeichert.",
        updated: "Änderungen gespeichert.",
        deleted: "Filter gelöscht.",
        placeholder: "Filter-Name (z. B. Commit Relevant – FR2)",
        saving: "Speichert…",
        saveChanges: "Änderungen speichern",
        discard: "Verwerfen",
        createFilter: "Filter speichern",
        createTitle: "Neuen Filter anlegen",
        savedFilters: "Gespeicherte Filter",
        loading: "Lade…",
        empty: "Keine Filter vorhanden.",
        editHint: "Klicken zum Laden / Bearbeiten",
        deleteLabel: "Löschen",
        editing: "Du bearbeitest gerade einen gespeicherten Filter.",
        unsaved: "Ungespeicherte Änderungen vorhanden.",
        unchanged: "Keine Änderungen.",
        selected: "ausgewählt",
      }
    : {
        confirmDelete: "Delete this filter?",
        saved: "Filter saved.",
        updated: "Changes saved.",
        deleted: "Filter deleted.",
        placeholder: "Filter name (e.g. Commit Relevant – FR2)",
        saving: "Saving…",
        saveChanges: "Save changes",
        discard: "Discard",
        createFilter: "Save filter",
        createTitle: "Create new filter",
        savedFilters: "Saved filters",
        loading: "Loading…",
        empty: "No filters available.",
        editHint: "Click to load / edit",
        deleteLabel: "Delete",
        editing: "You are currently editing a saved filter.",
        unsaved: "Unsaved changes present.",
        unchanged: "No changes.",
        selected: "selected",
      };

  /* ------------------------------------------------ */
  /* LOAD FILTERS                                    */
  /* ------------------------------------------------ */

  async function loadFilters() {
    setLoading(true);
    try {
      const { data } = await api.get("/commit/filters");
      const list = (data ?? []) as SavedFilter[];
      setFilters(list);
      setStoreFilters(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFilters();
  }, []);

  /* ------------------------------------------------ */
  /* ACTIVE FILTER BASELINE                          */
  /* ------------------------------------------------ */

  const activeSaved = useMemo(() => {
    if (!activeSavedId) return null;
    return filters.find((f) => f.id === activeSavedId) ?? null;
  }, [activeSavedId, filters]);

  const isDirty = useMemo(() => {
    if (!activeSaved) return false;
    const baseLabel = activeSaved.label ?? "";
    const baseRules = rulesToMap(activeSaved.rules);
    return (
      draftLabel.trim() !== baseLabel.trim() ||
      !shallowEqualRules(draftRules, baseRules)
    );
  }, [activeSaved, draftLabel, draftRules]);

  /* ------------------------------------------------ */
  /* HELPERS                                         */
  /* ------------------------------------------------ */

  function toggleValue(field: string, value: string) {
    setDraftRules((prev) => {
      const current = prev[field] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [field]: next };
    });
  }

  function selectedCount(field: string) {
    return (draftRules[field] ?? []).length;
  }

  function cacheCurrentDraftIfNeeded() {
    if (!activeSavedId) return;
    setDraftCache((prev) => ({
      ...prev,
      [activeSavedId]: { label: draftLabel, rules: draftRules },
    }));
  }

  function loadSavedFilter(f: SavedFilter) {
    cacheCurrentDraftIfNeeded();

    setActiveSavedId(f.id);

    const cached = draftCache[f.id];
    if (cached) {
      setDraftLabel(cached.label ?? f.label ?? "");
      setDraftRules(cached.rules ?? rulesToMap(f.rules));
      return;
    }

    setDraftLabel(f.label ?? "");
    setDraftRules(rulesToMap(f.rules));
  }

  function resetToSaved() {
    if (!activeSaved) return;
    setDraftLabel(activeSaved.label ?? "");
    setDraftRules(rulesToMap(activeSaved.rules));
    if (activeSavedId) {
      setDraftCache((prev) => {
        const next = { ...prev };
        delete next[activeSavedId];
        return next;
      });
    }
  }

  function showSavedFeedback(text: string) {
    setSaveMessage(text);
    window.setTimeout(() => setSaveMessage(null), 2500);
  }

  /* ------------------------------------------------ */
  /* CREATE NEW FILTER                               */
  /* ------------------------------------------------ */

  async function createNewFilter() {
    const label = draftLabel.trim();
    if (!label) return;

    const rules = buildRulesFromMap(draftRules);
    if (!rules.length) return;

    setSaving(true);
    try {
      await api.post("/commit/filters", { label, rules });
      await loadFilters();
      showSavedFeedback(copy.saved);
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------ */
  /* SAVE CHANGES (UPDATE)                           */
  /* ------------------------------------------------ */

  async function saveChanges() {
    if (!activeSavedId || !activeSaved) return;

    const label = draftLabel.trim();
    const rules = buildRulesFromMap(draftRules);

    if (!label || !rules.length) return;

    setSaving(true);
    try {
      await api.put(`/commit/filters/${activeSavedId}`, { label, rules });

      // clear local cache for that filter (since now saved)
      setDraftCache((prev) => {
        const next = { ...prev };
        delete next[activeSavedId];
        return next;
      });

      await loadFilters();

      // After reload, the dirty button will disappear by itself (baseline updated)
      showSavedFeedback(copy.updated);
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------ */
  /* DELETE FILTER                                   */
  /* ------------------------------------------------ */

  async function deleteFilter(id: string) {
    if (!confirm(copy.confirmDelete)) return;

    setSaving(true);
    try {
      await api.delete(`/commit/filters/${id}`);

      if (activeSavedId === id) {
        setActiveSavedId(null);
        setDraftLabel("");
        setDraftRules({});
      }

      setDraftCache((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      await loadFilters();
      showSavedFeedback(copy.deleted);
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <div className="h-full flex flex-col">
      {/* ================= STICKY HEADER ================= */}
      <div className="sticky top-0 z-20 bg-background border-b px-4 py-4 space-y-3">
        {/* EDIT BAR */}
        <div className="flex gap-3 items-center">
          <Input
            placeholder={copy.placeholder}
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
          />

          {activeSavedId && isDirty ? (
            <div className="flex gap-2">
              <Button onClick={saveChanges} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? copy.saving : copy.saveChanges}
              </Button>
              <Button variant="secondary" onClick={resetToSaved} disabled={saving}>
                <X className="w-4 h-4 mr-2" />
                {copy.discard}
              </Button>
            </div>
          ) : (
            <Button onClick={createNewFilter} disabled={saving} title={copy.createTitle}>
              <Plus className="w-4 h-4 mr-2" />
              {saving ? copy.saving : copy.createFilter}
            </Button>
          )}
        </div>

        {/* FEEDBACK LINE */}
        {saveMessage && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4" />
            <span>{saveMessage}</span>
          </div>
        )}

        {/* SAVED FILTERS */}
        <div>
          <div className="text-sm font-medium mb-2">{copy.savedFilters}</div>

          {loading && (
            <div className="text-sm text-muted-foreground">{copy.loading}</div>
          )}

          {!loading && filters.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {copy.empty}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {filters.map((f) => {
              const active = activeSavedId === f.id;

              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => loadSavedFilter(f)}
                  className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-sm transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent"
                  }`}
                  title={copy.editHint}
                >
                  <span>{f.label}</span>

                  <span onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => deleteFilter(f.id)}
                      className={`transition ${
                        active
                          ? "text-primary-foreground/80 hover:text-primary-foreground"
                          : "text-muted-foreground hover:text-red-500"
                      }`}
                      title={copy.deleteLabel}
                      disabled={saving}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </span>
                </button>
              );
            })}
          </div>

          {activeSavedId && (
            <div className="mt-2 text-xs text-muted-foreground">
              {copy.editing} {isDirty ? copy.unsaved : copy.unchanged}
            </div>
          )}
        </div>
      </div>

      {/* ================= SCROLLABLE CONTENT ================= */}
      <div className="flex-1 overflow-auto px-4 py-6 space-y-5">
        {FILTER_FIELDS.map((field) => {
          const values =
            (registry as Record<string, { value: string }[]>)[field.key] ?? [];

          if (!values.length) return null;

          const count = selectedCount(field.key);

          return (
            <div key={field.key} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{getFieldLabel(field.key, language as "de" | "en")}</div>

                {count > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full border text-muted-foreground">
                    {count} {copy.selected}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {values.map((v: any) => {
                  const active = draftRules[field.key]?.includes(v.value);

                  return (
                    <button
                      key={v.value}
                      onClick={() => toggleValue(field.key, v.value)}
                      className={`px-3 py-1 rounded-full text-sm border transition ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-accent"
                      }`}
                      title={v.value}
                      disabled={saving}
                    >
                      {v.value}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
