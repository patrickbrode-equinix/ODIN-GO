
import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Loader2, Database, UserMinus, UserPlus } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { useLanguage } from "../../context/LanguageContext";
import { normalizePlansByMonth } from "./shiftplan.months";
import { api } from "../../api/api";

interface MonthSummary {
  label: string;
  employees: number;
  shifts: number;
}

interface ReviewUserMatch {
  id: number;
  email: string | null;
  username: string | null;
  displayName: string | null;
  approved: boolean;
  isAdmin: boolean;
  isRoot: boolean;
  provisionedFromShiftplan: boolean;
  provisionedEmployeeName: string | null;
  match: "email" | "name";
}

interface ReviewNewEmployee {
  name: string;
  includeInImport: boolean;
  createUser: boolean;
  canCreateUser: boolean;
  user: ReviewUserMatch | null;
}

interface ReviewMissingEmployee {
  name: string;
  deleteFromDatabase: boolean;
  deleteOdinUser: boolean;
  canDeleteUser: boolean;
  deleteUserReason: string | null;
  user: ReviewUserMatch | null;
}

interface ReviewMatchedEmployee {
  name: string;
  includeInImport: boolean;
  importedShiftCount: number;
  user: ReviewUserMatch | null;
}

interface ReviewImportedEmployee {
  name: string;
  includeInImport: boolean;
  importedShiftCount: number;
  existsInTargetMonths: boolean;
  createUser: boolean;
  canCreateUser: boolean;
  canDeleteUser: boolean;
  deleteUserReason: string | null;
  user: ReviewUserMatch | null;
}

interface ImportReview {
  months: string[];
  importedEmployeeCount: number;
  existingEmployeeCount: number;
  importedEmployees: ReviewImportedEmployee[];
  newEmployees: ReviewNewEmployee[];
  matchedEmployees: ReviewMatchedEmployee[];
  missingEmployees: ReviewMissingEmployee[];
}

interface ImportResult {
  months: number;
  employees: number;
  changes: number;
  createdUsers: number;
  updatedUsers: number;
  deletedEmployees: number;
  deletedUsers: number;
  excludedEmployees: number;
}

interface Props {
  onImportSuccess?: () => void;
}

const SHIFT_IMPORT_COPY = {
  de: {
    trigger: "Import",
    title: "Shiftplan Import",
    analyzeError: "Fehler beim Analysieren der Datei.",
    importFailedPrefix: "Import fehlgeschlagen: ",
    success: "Import erfolgreich!",
    months: "Monate",
    employees: "Mitarbeiter",
    entries: "Einträge",
    createdUsers: "User neu",
    updatedUsers: "User aktualisiert",
    deletedEmployees: "DB-Löschungen",
    deletedUsers: "User gelöscht",
    excludedEmployees: "Nicht übernommen",
    close: "Schließen",
    analyzing: "Analysiere Datei…",
    dropFile: "Excel-Datei hierher ziehen",
    clickSelect: "oder klicken zum Auswählen (.xls, .xlsx, .xlsm)",
    overwriteHeader: "Folgende Monate werden überschrieben",
    unknownCodeSingle: "unbekannter Code",
    unknownCodePlural: "unbekannte Codes",
    unknownCodeHint: "Diese Codes werden als Rohwerte importiert. Fachliche Abstimmung ggf. nötig.",
    employeeReviewRequired: "Mitarbeiterabgleich erforderlich",
    employeeReviewDescription: "Es werden nur Mitarbeiter angezeigt, die in der Excel-Datei vorkommen. Sobald du einen Eintrag abwählst, wird dieser aus dem Dienstplan entfernt und vorhandene Mitarbeiterdaten inklusive passendem ODIN-User werden bereinigt, soweit das zulässig ist.",
    excelEmployees: "Mitarbeiter aus der Excel",
    overwriteExisting: "Excel-Einträge überschreiben bestehende Dienste in den Zielmonaten.",
    importNew: "Excel-Einträge werden neu in den Dienstplan übernommen.",
    foundOdinUser: "Gefundener ODIN-User",
    noOdinUser: "Noch kein passender ODIN-User gefunden",
    alreadyExists: "Bereits vorhanden",
    new: "Neu",
    includeInSchedule: "In Dienstplan übernehmen",
    createOdinUser: "ODIN-User anlegen",
    odinUserExists: "ODIN-User existiert bereits",
    removeWarning: "Dieser Mitarbeiter wird vollständig aus Dienstplan und Mitarbeiterdaten entfernt.",
    removeWarningDeleteUser: "Der gefundene ODIN-User wird dabei ebenfalls gelöscht.",
    noEmployeeReview: "Kein Mitarbeiterabgleich nötig",
    noEmployeeReviewDescription: "In der importierten Excel wurden keine Mitarbeiter mit Dienst-Einträgen erkannt.",
    otherMonthsUntouched: "Alle anderen Monate bleiben unberührt.",
    cancel: "Abbrechen",
    importing: "Importiere…",
    overwriteNow: "Jetzt überschreiben",
    skippedSheetsSingle: "Sheet übersprungen",
    skippedSheetsPlural: "Sheets übersprungen",
  },
  en: {
    trigger: "Import",
    title: "Shiftplan import",
    analyzeError: "Failed to analyze the file.",
    importFailedPrefix: "Import failed: ",
    success: "Import completed successfully!",
    months: "Months",
    employees: "Employees",
    entries: "Entries",
    createdUsers: "New users",
    updatedUsers: "Updated users",
    deletedEmployees: "DB deletions",
    deletedUsers: "Deleted users",
    excludedEmployees: "Excluded",
    close: "Close",
    analyzing: "Analyzing file…",
    dropFile: "Drop Excel file here",
    clickSelect: "or click to select (.xls, .xlsx, .xlsm)",
    overwriteHeader: "The following months will be overwritten",
    unknownCodeSingle: "unknown code",
    unknownCodePlural: "unknown codes",
    unknownCodeHint: "These codes are imported as raw values. Functional review may still be required.",
    employeeReviewRequired: "Employee review required",
    employeeReviewDescription: "Only employees found in the Excel file are shown here. If you deselect an entry, it will be removed from the shiftplan and matching employee data including the linked ODIN user will be cleaned up where allowed.",
    excelEmployees: "Employees from Excel",
    overwriteExisting: "Excel entries overwrite existing shifts in the target months.",
    importNew: "Excel entries will be imported into the shiftplan as new records.",
    foundOdinUser: "Matched ODIN user",
    noOdinUser: "No matching ODIN user found yet",
    alreadyExists: "Already exists",
    new: "New",
    includeInSchedule: "Include in shiftplan",
    createOdinUser: "Create ODIN user",
    odinUserExists: "ODIN user already exists",
    removeWarning: "This employee will be fully removed from the shiftplan and employee data.",
    removeWarningDeleteUser: "The matched ODIN user will also be deleted.",
    noEmployeeReview: "No employee review required",
    noEmployeeReviewDescription: "No employees with shift entries were detected in the imported Excel file.",
    otherMonthsUntouched: "All other months remain unchanged.",
    cancel: "Cancel",
    importing: "Importing…",
    overwriteNow: "Overwrite now",
    skippedSheetsSingle: "sheet skipped",
    skippedSheetsPlural: "sheets skipped",
  },
} as const;

export function ShiftImportDialog({ onImportSuccess }: Props) {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const copy = isGerman ? SHIFT_IMPORT_COPY.de : SHIFT_IMPORT_COPY.en;
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedData, setParsedData] = useState<Record<string, any> | null>(null);
  const [monthSummaries, setMonthSummaries] = useState<MonthSummary[]>([]);
  const [skippedSheets, setSkippedSheets] = useState<{ sheet: string; reason: string }[]>([]);
  const [unknownCodes, setUnknownCodes] = useState<string[]>([]);
  const [importReview, setImportReview] = useState<ImportReview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const analyzeFile = async (f: File) => {
    setFile(f);
    setAnalyzing(true);
    try {
      let year = new Date().getFullYear();
      const yearMatch = f.name.match(/(20\d{2})/);
      if (yearMatch) year = Number(yearMatch[1]);

      const { parseShiftplanExcel } = await import("../../utils/shiftplanExcelImporter");
      const parseResult = await parseShiftplanExcel(f);
      const rawPlans = parseResult.data;
      const skipped = parseResult.skippedSheets;
      const normalized = normalizePlansByMonth(rawPlans, year);

      // Log import details
      for (const entry of parseResult.log) {
        if (entry.level === "error") console.error(`[IMPORT] ${entry.sheet ?? ""} ${entry.message}`);
        else if (entry.level === "warn") console.warn(`[IMPORT] ${entry.sheet ?? ""} ${entry.message}`);
        else console.log(`[IMPORT] ${entry.sheet ?? ""} ${entry.message}`);
      }

      const schedules: Record<string, any> = {};
      const summaries: MonthSummary[] = [];

      for (const { label, plan } of normalized) {
        const monthSchedule: Record<string, any> = {};
        let shiftCount = 0;
        for (const emp of plan.employees || []) {
          const dayMap: Record<number, string> = {};
          for (const [dayKey, shiftCode] of Object.entries(emp.shifts)) {
            const d = Number(dayKey);
            if (shiftCode) { dayMap[d] = String(shiftCode).trim(); shiftCount++; }
          }
          // Keep roster members even when a monthly sheet contains no shifts
          // for them. The backend can then review/provision the employee while
          // the schedule row remains intentionally empty.
          monthSchedule[emp.name] = dayMap;
        }
        schedules[label] = monthSchedule;
        summaries.push({ label, employees: Object.keys(monthSchedule).length, shifts: shiftCount });
      }

      const reviewRes = await api.post("/schedules/import/review", { schedules });

      setParsedData(schedules);
      setMonthSummaries(summaries);
      setSkippedSheets(skipped);
      setUnknownCodes(parseResult.unknownCodes);
      setImportReview(reviewRes.data?.review || null);
    } catch (err) {
      console.error("Analysis Error", err);
      alert(copy.analyzeError);
      reset();
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) analyzeFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".xlsm"))) analyzeFile(f);
  };

  const handleConfirm = async () => {
    if (!parsedData) return;
    setUploading(true);
    try {
      const res = await api.post("/schedules/import/merge", {
        schedules: parsedData,
        employeeActions: {
          additions: (importReview?.importedEmployees || [])
            .filter((item) => !item.existsInTargetMonths)
            .map((item) => ({
            name: item.name,
            includeInImport: item.includeInImport,
            createUser: item.canCreateUser ? item.createUser : false,
          })),
          updates: (importReview?.importedEmployees || [])
            .filter((item) => item.existsInTargetMonths)
            .map((item) => ({
            name: item.name,
            includeInImport: item.includeInImport,
          })),
          removals: [],
        },
      });
      const d = res.data || {};
      const actions = d.employeeActionsResult || {};
      setImportResult({
        months: d.months_count ?? monthSummaries.length,
        employees: d.employees_count ?? monthSummaries.reduce((s, m) => Math.max(s, m.employees), 0),
        changes: d.changes_count ?? monthSummaries.reduce((s, m) => s + m.shifts, 0),
        createdUsers: actions.createdUsersCount ?? d.userProvisioning?.created ?? 0,
        updatedUsers: actions.updatedUsersCount ?? d.userProvisioning?.updated ?? 0,
        deletedEmployees: actions.deletedEmployeesCount ?? 0,
        deletedUsers: actions.deletedUsersCount ?? 0,
        excludedEmployees: Array.isArray(actions.excludedEmployees) ? actions.excludedEmployees.length : 0,
      });
      onImportSuccess?.();
    } catch (err: any) {
      console.error("Upload Error", err);
      alert(copy.importFailedPrefix + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setParsedData(null);
    setMonthSummaries([]);
    setSkippedSheets([]);
    setUnknownCodes([]);
    setImportReview(null);
    setImportResult(null);
  };

  const updateImportedEmployee = (name: string, patch: Partial<ReviewImportedEmployee>) => {
    setImportReview((prev) => prev ? {
      ...prev,
      importedEmployees: prev.importedEmployees.map((item) => item.name === name ? { ...item, ...patch } : item),
      newEmployees: prev.newEmployees.map((item) => item.name === name ? { ...item, ...patch } : item),
      matchedEmployees: prev.matchedEmployees.map((item) => item.name === name ? { ...item, ...patch } : item),
    } : prev);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="h-7 border border-border bg-background/85 px-3 text-[11px] font-bold tracking-wider uppercase text-foreground shadow-sm hover:bg-accent">
          <Upload className="w-3.5 h-3.5 mr-1.5" />
          {copy.trigger}
        </Button>
      </DialogTrigger>

      <DialogContent className="theme-modal-surface max-w-lg rounded-2xl border border-blue-500/15 shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
        <DialogHeader>
          <DialogTitle className="text-base font-black tracking-wider uppercase text-foreground">
            {copy.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* SUCCESS */}
          {importResult ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-400 drop-shadow-[0_0_12px_rgba(34,197,94,0.6)]" />
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{copy.success}</p>
              <div className="grid grid-cols-3 gap-3 w-full mt-2">
                {[
                  { label: copy.months, value: importResult.months },
                  { label: copy.employees, value: importResult.employees },
                  { label: copy.entries, value: importResult.changes },
                ].map(s => (
                  <div key={s.label} className="theme-glass-inset rounded-xl border py-3 px-2 text-center">
                    <div className="text-2xl font-black text-foreground">{s.value}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
              {(importResult.createdUsers > 0 || importResult.updatedUsers > 0 || importResult.deletedEmployees > 0 || importResult.deletedUsers > 0 || importResult.excludedEmployees > 0) && (
                <div className="grid grid-cols-2 gap-3 w-full mt-2">
                  {[
                    { label: copy.createdUsers, value: importResult.createdUsers },
                    { label: copy.updatedUsers, value: importResult.updatedUsers },
                    { label: copy.deletedEmployees, value: importResult.deletedEmployees },
                    { label: copy.deletedUsers, value: importResult.deletedUsers },
                    { label: copy.excludedEmployees, value: importResult.excludedEmployees },
                  ].filter((item) => item.value > 0).map((item) => (
                    <div key={item.label} className="theme-glass-inset rounded-xl border py-3 px-2 text-center">
                      <div className="text-xl font-black text-foreground">{item.value}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={() => setOpen(false)} className="mt-2 bg-green-600/80 hover:bg-green-600 text-white">{copy.close}</Button>
            </div>
          ) : !parsedData ? (
            /* DROPZONE */
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 py-10 px-6 rounded-xl border-2 border-dashed cursor-pointer transition-all
                ${dragOver ? "border-indigo-400/60 bg-indigo-500/10" : "border-border bg-background/70 hover:border-border/80 hover:bg-accent/60"}`}
            >
              <input ref={fileInputRef} type="file" accept=".xls,.xlsx,.xlsm" onChange={handleFileChange} className="hidden" disabled={analyzing} />
              {analyzing ? (
                <>
                  <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                  <p className="text-sm text-muted-foreground">{copy.analyzing}</p>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-10 h-10 text-indigo-400/70" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">{copy.dropFile}</p>
                    <p className="text-xs text-muted-foreground mt-1">{copy.clickSelect}</p>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* SUMMARY */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  <FileSpreadsheet className="w-4 h-4 inline mr-1.5 text-indigo-400" />
                  {file?.name}
                </p>
                <button onClick={reset} className="text-muted-foreground hover:text-foreground p-1 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="text-xs font-bold text-amber-300 uppercase tracking-wide">{copy.overwriteHeader}</p>
                </div>
                <div className="space-y-1.5">
                  {monthSummaries.map(s => (
                    <div key={s.label} className="theme-glass-inset flex items-center justify-between rounded-lg border px-2 py-1.5 text-xs">
                      <span className="font-semibold text-foreground">{s.label}</span>
                      <div className="flex gap-3 text-muted-foreground">
                        <span>{s.employees} {copy.employees}</span>
                        <span>{s.shifts} {copy.entries}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {skippedSheets.length > 0 && (
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                    <p className="text-xs font-bold text-orange-300 uppercase tracking-wide">
                      {skippedSheets.length} {skippedSheets.length > 1 ? copy.skippedSheetsPlural : copy.skippedSheetsSingle}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {skippedSheets.map(s => (
                      <div key={s.sheet} className="theme-glass-inset flex items-start justify-between gap-2 rounded border px-2 py-1 text-xs">
                        <span className="shrink-0 font-semibold text-foreground">{s.sheet}</span>
                        <span className="text-orange-300/80 text-right">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {unknownCodes.length > 0 && (
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                    <p className="text-xs font-bold text-yellow-300 uppercase tracking-wide">
                      {unknownCodes.length} {unknownCodes.length > 1 ? copy.unknownCodePlural : copy.unknownCodeSingle}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {unknownCodes.map(c => (
                      <span key={c} className="text-xs px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 font-mono">{c}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-yellow-300/60 mt-1.5">{copy.unknownCodeHint}</p>
                </div>
              )}
              {importReview && importReview.importedEmployees.length > 0 && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-blue-300 shrink-0" />
                    <p className="text-xs font-bold text-blue-200 uppercase tracking-wide">{copy.employeeReviewRequired}</p>
                  </div>
                  <p className="text-[11px] text-blue-100/70 leading-relaxed">
                    {copy.employeeReviewDescription}
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-blue-300">
                      <Database className="w-3.5 h-3.5" />
                      {copy.excelEmployees} ({importReview.importedEmployees.length})
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {importReview.importedEmployees.map((item) => (
                        <div key={item.name} className="theme-glass-inset rounded-lg border p-2.5 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{item.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {item.existsInTargetMonths
                                  ? `${item.importedShiftCount} ${copy.overwriteExisting}`
                                  : `${item.importedShiftCount} ${copy.importNew}`}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {item.user
                                  ? `${copy.foundOdinUser}: ${item.user.displayName || item.user.email || item.user.username}`
                                  : copy.noOdinUser}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wide ${item.existsInTargetMonths
                                ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
                                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                              }`}>
                                {item.existsInTargetMonths ? copy.alreadyExists : copy.new}
                              </span>
                              {item.user && (
                                <span className="rounded border border-border bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Match {item.user.match}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="flex items-center gap-2 rounded-lg border border-border bg-background/80 px-2.5 py-2 text-xs text-foreground">
                              <Checkbox
                                checked={item.includeInImport}
                                onCheckedChange={(checked) => updateImportedEmployee(item.name, { includeInImport: checked === true })}
                              />
                              <span>{copy.includeInSchedule}</span>
                            </label>
                            {!item.existsInTargetMonths && (
                              <label className={`flex items-center gap-2 rounded-lg border border-border bg-background/80 px-2.5 py-2 text-xs ${item.canCreateUser ? 'text-foreground' : 'text-muted-foreground/70'}`}>
                                <Checkbox
                                  checked={item.createUser}
                                  disabled={!item.canCreateUser}
                                  onCheckedChange={(checked) => updateImportedEmployee(item.name, { createUser: checked === true })}
                                />
                                <span>{item.canCreateUser ? copy.createOdinUser : copy.odinUserExists}</span>
                              </label>
                            )}
                          </div>
                          {!item.includeInImport && (
                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-100/80">
                              {copy.removeWarning}
                              {item.canDeleteUser
                                ? ` ${copy.removeWarningDeleteUser}`
                                : item.deleteUserReason
                                ? ` ${item.deleteUserReason}.`
                                : ''}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {importReview && importReview.importedEmployees.length === 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-xs font-bold text-emerald-300 uppercase tracking-wide">{copy.noEmployeeReview}</p>
                  <p className="text-[11px] text-emerald-100/70 mt-1">
                    {copy.noEmployeeReviewDescription}
                  </p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">{copy.otherMonthsUntouched}</p>
            </div>
          )}
        </div>

        {!importResult && (
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">{copy.cancel}</Button>
            {parsedData && (
              <Button onClick={handleConfirm} disabled={uploading}
                className="bg-indigo-600/80 hover:bg-indigo-600 text-white font-bold">
                {uploading ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />{copy.importing}</> : copy.overwriteNow}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
