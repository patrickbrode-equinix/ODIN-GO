/* ================================================ */
/* ODIN-Logik — Filter Bar                          */
/* ================================================ */

import { useAssignmentStore } from '../../store/assignmentStore';
import type { AssignmentMode, RunStatus, DecisionResult } from '../../types/assignment';
import { useLanguage } from '../../context/LanguageContext';

export function AssignmentFilters() {
  const { filters, setFilters } = useAssignmentStore();
  const { language } = useLanguage();
  const isGerman = language === 'de';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Run Mode Filter */}
      <div className="flex flex-col gap-0.5">
        <label className="text-[10px] text-muted-foreground font-medium">{isGerman ? 'Modus' : 'Mode'}</label>
        <select
          className="text-xs rounded-md border border-border/40 bg-background/60 px-2 py-1 text-foreground"
          value={filters.runMode || ''}
          onChange={(e) => setFilters({ runMode: (e.target.value || undefined) as AssignmentMode | undefined })}
        >
          <option value="">{isGerman ? 'Alle' : 'All'}</option>
          <option value="shadow">Shadow</option>
          <option value="dry-run">Dry-Run</option>
        </select>
      </div>

      {/* Run Status Filter */}
      <div className="flex flex-col gap-0.5">
        <label className="text-[10px] text-muted-foreground font-medium">{isGerman ? 'Laufstatus' : 'Run status'}</label>
        <select
          className="text-xs rounded-md border border-border/40 bg-background/60 px-2 py-1 text-foreground"
          value={filters.runStatus || ''}
          onChange={(e) => setFilters({ runStatus: (e.target.value || undefined) as RunStatus | undefined })}
        >
          <option value="">{isGerman ? 'Alle' : 'All'}</option>
          <option value="completed">{isGerman ? 'Abgeschlossen' : 'Completed'}</option>
          <option value="failed">{isGerman ? 'Fehlgeschlagen' : 'Failed'}</option>
          <option value="running">{isGerman ? 'Läuft' : 'Running'}</option>
        </select>
      </div>

      {/* Decision Result Filter */}
      <div className="flex flex-col gap-0.5">
        <label className="text-[10px] text-muted-foreground font-medium">{isGerman ? 'Ergebnis' : 'Result'}</label>
        <select
          className="text-xs rounded-md border border-border/40 bg-background/60 px-2 py-1 text-foreground"
          value={filters.decisionResult || ''}
          onChange={(e) => setFilters({ decisionResult: (e.target.value || undefined) as DecisionResult | undefined })}
        >
          <option value="">{isGerman ? 'Alle' : 'All'}</option>
          <option value="assigned">{isGerman ? 'Zugewiesen' : 'Assigned'}</option>
          <option value="manual_review">{isGerman ? 'Manuelle Prüfung' : 'Manual review'}</option>
          <option value="no_candidate">{isGerman ? 'Kein Kandidat' : 'No candidate'}</option>
          <option value="not_relevant">{isGerman ? 'Nicht relevant' : 'Not relevant'}</option>
          <option value="blocked">{isGerman ? 'Gesperrt' : 'Blocked'}</option>
          <option value="error">{isGerman ? 'Fehler' : 'Error'}</option>
        </select>
      </div>
    </div>
  );
}
