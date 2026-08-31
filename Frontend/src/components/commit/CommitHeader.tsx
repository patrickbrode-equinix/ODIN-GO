/* ------------------------------------------------ */
/* COMMIT HEADER – CENTRAL SETTINGS + FILTER BAR    */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { read, utils } from "xlsx";
import { Upload, SlidersHorizontal } from "lucide-react";

/* API */
import { api } from "../../api/api";

/* UI */
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useLanguage } from "../../context/LanguageContext";

/* Store */
import { useCommitStore } from "../../store/commitStore";

/* Panels */
import { CommitSubTypePanel } from "./CommitSubTypePanel";
import { CommitFiltersPanel } from "./CommitFiltersPanel";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

interface CommitStats {
  relevant: number;
  ignored: number;
  unknown: number;
  expired: number;
}

interface CommitHeaderProps {
  lastImportAt: string;
  commitStats: CommitStats;
  onUpload: (rows: any[]) => void;
}

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export function CommitHeader({
  lastImportAt,
  commitStats,
  onUpload,
}: CommitHeaderProps) {
  const { language } = useLanguage();
  const [showSettings, setShowSettings] = useState(false);

  const copy = language === "de"
    ? {
        title: "Commit Date Dashboard",
        lastImport: "Letzter Import",
        settings: "Commit Einstellungen",
        upload: "Hochladen",
        settingsTitle: "Commit Einstellungen",
        filtersTab: "Filter",
        subTypesTab: "Subtypen",
      }
    : {
        title: "Commit Date Dashboard",
        lastImport: "Last import",
        settings: "Commit settings",
        upload: "Upload",
        settingsTitle: "Commit settings",
        filtersTab: "Filters",
        subTypesTab: "Sub-types",
      };

  /* STORE */
  const filters = useCommitStore((s) => s.filters);
  const activeFilter = useCommitStore((s) => s.activeFilter);
  const applyFilter = useCommitStore((s) => s.applyFilter);

  /* ------------------------------------------------ */
  /* LOAD FILTER PRESETS                              */
  /* ------------------------------------------------ */

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await api.get("/commit/filters");
        if (!alive) return;
        const valid = Array.isArray(res.data) ? res.data : [];
        useCommitStore.getState().setFilters(valid);
      } catch {
        /* handled globally */
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  /* ------------------------------------------------ */
  /* FILE HANDLER                                    */
  /* ------------------------------------------------ */

  async function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    let rows: any[] = [];

    if (ext === "csv") {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (!lines.length) return;

      const delimiter =
        lines[0].includes(";")
          ? ";"
          : lines[0].includes("\t")
            ? "\t"
            : ",";

      const header = lines[0].split(delimiter).map((h) => h.trim());

      rows = lines.slice(1).map((line) => {
        const cols = line.split(delimiter);
        const row: any = {};
        header.forEach((h, i) => {
          row[h] = cols[i]?.trim() ?? "";
        });
        return row;
      });
    } else {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const workbook = read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = utils.sheet_to_json(sheet, { raw: false });
    }

    if (rows.length) {
      onUpload(rows);
    }
  }

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <div className="flex flex-col gap-5">
      {/* ================= HEADER ================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {copy.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {copy.lastImport}: {lastImportAt}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {copy.settings}
          </Button>

          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground cursor-pointer hover:opacity-90 transition">
            <Upload className="w-4 h-4" />
            {copy.upload}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleFile(file);
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>
      </div>

      {/* ================= STATS ================= */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-400">
          Relevant {commitStats.relevant}
        </span>
        <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground">
          Ignored {commitStats.ignored}
        </span>
        <span className="px-3 py-1 rounded-full bg-orange-500/10 text-orange-400">
          Unknown {commitStats.unknown}
        </span>
        <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-400">
          Expired {commitStats.expired}
        </span>
      </div>

      {/* ================= FILTER BUTTONS ================= */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const active = activeFilter?.id === f.id;

            return (
              <button
                key={f.id}
                onClick={() => applyFilter(active ? null : f)}
                className={`px-3 py-1 rounded-full text-sm border transition ${active
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent"
                  }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ================= SETTINGS PANEL ================= */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        {showSettings && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onMouseDown={() => setShowSettings(false)}
          >
            <div
              className="
                w-[90vw]
                max-w-[1200px]
                h-[80vh]
                bg-background
                rounded-2xl
                shadow-2xl
                flex
                flex-col
                overflow-hidden
              "
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* HEADER */}
              <div className="px-8 py-5 border-b flex items-center justify-between">
                <h2 className="text-xl font-semibold">{copy.settingsTitle}</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  ✕
                </button>
              </div>

              {/* BODY */}
              <div className="flex-1 overflow-hidden px-8 py-6">
                <Tabs defaultValue="filters" className="h-full flex flex-col">
                  <TabsList className="mb-6">
                    <TabsTrigger value="filters">{copy.filtersTab}</TabsTrigger>
                    <TabsTrigger value="subtypes">{copy.subTypesTab}</TabsTrigger>
                  </TabsList>

                  <div className="flex-1 overflow-hidden">
                    <TabsContent
                      value="filters"
                      className="h-full overflow-auto pr-6"
                    >
                      <CommitFiltersPanel />
                    </TabsContent>

                    <TabsContent
                      value="subtypes"
                      className="h-full overflow-auto pr-6"
                    >
                      <CommitSubTypePanel />
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
