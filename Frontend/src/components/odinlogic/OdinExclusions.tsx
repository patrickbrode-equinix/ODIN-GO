/* ------------------------------------------------ */
/* ODIN EXCLUSIONS – Manual exclusion list          */
/* System names blocked from auto-assignment        */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldBan, Tag } from "lucide-react";
import {
  AssignmentApi,
  type AssignmentExclusionEntry,
  type AssignmentSubtypeExclusionEntry,
} from "../../api/assignment";
import { InfoTooltip } from "../ui/InfoTooltip";
import { getLanguageLocale, useLanguage } from "../../context/LanguageContext";

export default function OdinExclusions() {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const locale = getLanguageLocale(language);
  const [exclusions, setExclusions] = useState<AssignmentExclusionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableSystemNames, setAvailableSystemNames] = useState<string[]>([]);
  const [newSystemName, setNewSystemName] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subtype Exclusions state
  const [subtypeExclusions, setSubtypeExclusions] = useState<AssignmentSubtypeExclusionEntry[]>([]);
  const [subtypeLoading, setSubtypeLoading] = useState(true);
  const [availableSubtypes, setAvailableSubtypes] = useState<string[]>([]);
  const [selectedSubtype, setSelectedSubtype] = useState("");
  const [subtypeReason, setSubtypeReason] = useState("");
  const [addingSubtype, setAddingSubtype] = useState(false);
  const [subtypeError, setSubtypeError] = useState<string | null>(null);

  const filteredSystemNames = availableSystemNames.filter((systemName) => {
    const normalizedSystemName = systemName.toLowerCase().trim();
    const alreadyExcluded = exclusions.some((entry) => entry.system_name.toLowerCase().trim() === normalizedSystemName);
    const matchesFilter = !newSystemName.trim() || normalizedSystemName.includes(newSystemName.toLowerCase().trim());
    return !alreadyExcluded && matchesFilter;
  });

  const filteredSubtypes = availableSubtypes.filter((subtype) => {
    const normalizedSubtype = subtype.toLowerCase().trim();
    const alreadyExcluded = subtypeExclusions.some((entry) => entry.subtype.toLowerCase().trim() === normalizedSubtype);
    const matchesFilter = !selectedSubtype.trim() || normalizedSubtype.includes(selectedSubtype.toLowerCase().trim());
    return !alreadyExcluded && matchesFilter;
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      AssignmentApi.getExclusions(),
      AssignmentApi.getAvailableSystemNames(),
    ])
      .then(([loadedExclusions, systemNames]) => {
        setExclusions(loadedExclusions);
        setAvailableSystemNames(systemNames);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); loadSubtypes(); }, []);

  const handleAdd = async () => {
    if (!newSystemName.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await AssignmentApi.addExclusion(newSystemName.trim(), newReason.trim() || undefined);
      setNewSystemName("");
      setNewReason("");
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number, systemName: string) => {
    if (!confirm(isGerman ? `Systemname "${systemName}" von der Ausnahmeliste entfernen?` : `Remove system name "${systemName}" from the exclusion list?`)) return;
    try {
      await AssignmentApi.deleteExclusion(id);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  // --- Subtype exclusion handlers ---
  const loadSubtypes = () => {
    setSubtypeLoading(true);
    Promise.all([
      AssignmentApi.getSubtypeExclusions(),
      AssignmentApi.getAvailableSubtypes(),
    ])
      .then(([excl, avail]) => {
        setSubtypeExclusions(excl);
        setAvailableSubtypes(avail);
      })
      .catch(() => {})
      .finally(() => setSubtypeLoading(false));
  };

  const handleAddSubtype = async () => {
    if (!selectedSubtype.trim()) return;
    setAddingSubtype(true);
    setSubtypeError(null);
    try {
      await AssignmentApi.addSubtypeExclusion(selectedSubtype.trim(), subtypeReason.trim() || undefined);
      setSelectedSubtype("");
      setSubtypeReason("");
      loadSubtypes();
    } catch (e: any) {
      setSubtypeError(e?.response?.data?.error || e.message);
    } finally {
      setAddingSubtype(false);
    }
  };

  const handleDeleteSubtype = async (id: number, subtype: string) => {
    if (!confirm(isGerman ? `Subtype "${subtype}" von der Ausnahmeliste entfernen?` : `Remove subtype "${subtype}" from the exclusion list?`)) return;
    try {
      await AssignmentApi.deleteSubtypeExclusion(id);
      loadSubtypes();
    } catch (e: any) {
      setSubtypeError(e?.response?.data?.error || e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <ShieldBan className="w-5 h-5 text-amber-400" />
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-sm">{isGerman ? 'Manuelle Ausnahmeliste' : 'Manual exclusion list'}</h3>
            <InfoTooltip title={isGerman ? 'Manuelle Ausnahmeliste' : 'Manual exclusion list'} side="right" align="start" width="w-96">
              <p>{isGerman ? 'Systeme in dieser Liste werden aus der Auto-Zuweisung entfernt und landen im manuellen Review.' : 'Systems in this list are removed from auto-assignment and routed to manual review.'}</p>
            </InfoTooltip>
          </div>
          <p className="text-xs text-muted-foreground">{isGerman ? 'Tickets mit diesen Systemnamen werden nicht automatisch zugewiesen, sondern gehen an den Dispatcher zur manuellen Prüfung.' : 'Tickets with these system names are not assigned automatically and go to the dispatcher for manual review.'}</p>
        </div>
      </div>

      {/* ADD FORM */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{isGerman ? 'Systemname' : 'System name'}</span>
            <InfoTooltip title={isGerman ? 'Systemname' : 'System name'} side="right"><p>{isGerman ? 'Exakter oder aus der Datenbank übernommener Systemname, der von der automatischen Zuweisung ausgeschlossen werden soll.' : 'Exact system name or a database value that should be excluded from automatic assignment.'}</p></InfoTooltip>
          </div>
          <input
            type="text"
            value={newSystemName}
            onChange={(e) => setNewSystemName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={isGerman ? 'z. B. ABC-SYSTEM-01' : 'e.g. ABC-SYSTEM-01'}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-indigo-500/50 focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{isGerman ? 'Grund (optional)' : 'Reason (optional)'}</span>
            <InfoTooltip title={isGerman ? 'Grund' : 'Reason'} side="right"><p>{isGerman ? 'Fachliche Begründung, warum dieses System manuell bearbeitet werden muss, z. B. Sonderprozess oder unvollständige Datenlage.' : 'Operational reason why this system must be handled manually, for example a special process or incomplete data.'}</p></InfoTooltip>
          </div>
          <input
            type="text"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={isGerman ? 'z. B. Sonderprozess erforderlich' : 'e.g. special process required'}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-indigo-500/50 focus:outline-none"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !newSystemName.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition"
        >
          <Plus className="w-4 h-4" />
          {isGerman ? 'Hinzufügen' : 'Add'}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{isGerman ? `Aktuelle Systemnamen aus der Datenbank (${filteredSystemNames.length})` : `Current system names from the database (${filteredSystemNames.length})`}</span>
            <InfoTooltip title={isGerman ? 'Aktuelle Systemnamen' : 'Current system names'} side="right" align="start"><p>{isGerman ? 'Diese Vorschlagsliste basiert auf real vorkommenden Systemnamen und verhindert Tippfehler beim Ausschluss.' : 'This suggestion list is based on real system names from the database and helps avoid typos.'}</p></InfoTooltip>
        </div>
        {filteredSystemNames.length === 0 ? (
          <div className="text-xs text-muted-foreground">{isGerman ? 'Keine weiteren Systemnamen zur Auswahl.' : 'No additional system names available.'}</div>
        ) : (
          <div className="flex max-h-40 flex-wrap gap-2 overflow-auto pr-2">
            {filteredSystemNames.map((systemName) => (
              <button
                key={systemName}
                type="button"
                onClick={() => setNewSystemName(systemName)}
                className={`rounded-full border px-3 py-1 text-xs transition ${newSystemName === systemName
                  ? "border-indigo-400/40 bg-indigo-500/20 text-indigo-100"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-indigo-400/30 hover:bg-indigo-500/10 hover:text-foreground"
                }`}
              >
                {systemName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TABLE */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2"><span className="inline-flex items-center gap-1">{isGerman ? 'Systemname' : 'System name'} <InfoTooltip title={isGerman ? 'Systemname' : 'System name'} side="right"><p>{isGerman ? 'Der konkret ausgeschlossene Systemname.' : 'The exact excluded system name.'}</p></InfoTooltip></span></th>
              <th className="text-left px-4 py-2"><span className="inline-flex items-center gap-1">{isGerman ? 'Grund' : 'Reason'} <InfoTooltip title={isGerman ? 'Grund' : 'Reason'} side="right"><p>{isGerman ? 'Dokumentiert, warum der Ausschluss existiert.' : 'Documents why the exclusion exists.'}</p></InfoTooltip></span></th>
              <th className="text-left px-4 py-2"><span className="inline-flex items-center gap-1">{isGerman ? 'Erstellt von' : 'Created by'} <InfoTooltip title={isGerman ? 'Erstellt von' : 'Created by'} side="right"><p>{isGerman ? 'Nutzer oder System, das den Ausschluss angelegt hat.' : 'User or system that created the exclusion.'}</p></InfoTooltip></span></th>
              <th className="text-left px-4 py-2"><span className="inline-flex items-center gap-1">{isGerman ? 'Erstellt am' : 'Created at'} <InfoTooltip title={isGerman ? 'Erstellt am' : 'Created at'} side="right"><p>{isGerman ? 'Zeitpunkt, an dem der Ausschluss angelegt wurde.' : 'Timestamp when the exclusion was created.'}</p></InfoTooltip></span></th>
              <th className="w-16 px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{isGerman ? 'Laden...' : 'Loading...'}</td></tr>
            )}
            {!loading && exclusions.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{isGerman ? 'Keine Einträge auf der Ausnahmeliste' : 'No entries in the exclusion list'}</td></tr>
            )}
            {exclusions.map((ex) => (
              <tr key={ex.id} className="hover:bg-white/5 transition">
                <td className="px-4 py-2 font-mono font-medium">{ex.system_name}</td>
                <td className="px-4 py-2 text-muted-foreground">{ex.reason || "—"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{ex.created_by}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {new Date(ex.created_at).toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleDelete(ex.id, ex.system_name)}
                    className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400 transition"
                    title={isGerman ? 'Entfernen' : 'Remove'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── SUBTYPE EXCLUSIONS ───────────────────── */}
      <div className="border-t border-white/10 pt-6 mt-6">
        <div className="flex items-center gap-3 mb-2">
          <Tag className="w-5 h-5 text-orange-400" />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-sm">{isGerman ? 'Subtype-Ausnahmen' : 'Subtype exclusions'}</h3>
              <InfoTooltip title={isGerman ? 'Subtype-Ausnahmen' : 'Subtype exclusions'} side="right" align="start"><p>{isGerman ? 'Bestimmte customer_trouble_type-Werte werden hier gezielt von ODIN ausgeschlossen.' : 'Specific customer_trouble_type values can be excluded from ODIN here.'}</p></InfoTooltip>
            </div>
            <p className="text-xs text-muted-foreground">{isGerman ? 'Tickets mit diesen Subtypes (customer_trouble_type) werden nicht automatisch zugewiesen.' : 'Tickets with these subtypes (customer_trouble_type) are not assigned automatically.'}</p>
          </div>
        </div>

        {/* ADD SUBTYPE FORM */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Subtype</span>
              <InfoTooltip title="Subtype" side="right"><p>{isGerman ? 'Der Ticket-Subtype, der in den manuellen Review umgeleitet werden soll.' : 'The ticket subtype that should be routed to manual review.'}</p></InfoTooltip>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedSubtype}
                onChange={(e) => setSelectedSubtype(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-indigo-500/50 focus:outline-none"
              >
                <option value="">{isGerman ? '— Subtype wählen —' : '— Select subtype —'}</option>
                {availableSubtypes
                  .filter((s) => !subtypeExclusions.some((e) => e.subtype === s))
                  .map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
              </select>
              <input
                type="text"
                value={selectedSubtype}
                onChange={(e) => setSelectedSubtype(e.target.value)}
                placeholder={isGerman ? 'oder manuell eingeben' : 'or enter manually'}
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-indigo-500/50 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{isGerman ? 'Grund (optional)' : 'Reason (optional)'}</span>
              <InfoTooltip title={isGerman ? 'Grund' : 'Reason'} side="right"><p>{isGerman ? 'Optionaler Hinweis, warum dieser Subtype nicht automatisch verteilt werden soll.' : 'Optional note describing why this subtype should not be assigned automatically.'}</p></InfoTooltip>
            </div>
            <input
              type="text"
              value={subtypeReason}
              onChange={(e) => setSubtypeReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddSubtype()}
              placeholder={isGerman ? 'z. B. Sonderprozess' : 'e.g. special process'}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-indigo-500/50 focus:outline-none"
            />
          </div>
          <button
            onClick={handleAddSubtype}
            disabled={addingSubtype || !selectedSubtype.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-500 disabled:opacity-50 transition"
          >
            <Plus className="w-4 h-4" />
            {isGerman ? 'Hinzufügen' : 'Add'}
          </button>
        </div>

        {subtypeError && (
          <div className="text-sm text-red-400 bg-red-500/10 p-2 rounded-lg border border-red-500/20 mt-2">
            {subtypeError}
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{isGerman ? `Aktuelle Ticket-Subtypes aus der Datenbank (${filteredSubtypes.length})` : `Current ticket subtypes from the database (${filteredSubtypes.length})`}</span>
            <InfoTooltip title={isGerman ? 'Aktuelle Ticket-Subtypes' : 'Current ticket subtypes'} side="right" align="start"><p>{isGerman ? 'Vorschlagsliste aus der Datenbank, damit Ausschlüsse konsistent und ohne Tippfehler gepflegt werden.' : 'Suggestion list from the database so exclusions can be maintained consistently and without typos.'}</p></InfoTooltip>
          </div>
          {filteredSubtypes.length === 0 ? (
            <div className="text-xs text-muted-foreground">{isGerman ? 'Keine weiteren Subtypes zur Auswahl.' : 'No additional subtypes available.'}</div>
          ) : (
            <div className="flex max-h-40 flex-wrap gap-2 overflow-auto pr-2">
              {filteredSubtypes.map((subtype) => (
                <button
                  key={subtype}
                  type="button"
                  onClick={() => setSelectedSubtype(subtype)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${selectedSubtype === subtype
                    ? "border-orange-400/40 bg-orange-500/20 text-orange-100"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:border-orange-400/30 hover:bg-orange-500/10 hover:text-foreground"
                  }`}
                >
                  {subtype}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* SUBTYPE TABLE */}
        <div className="rounded-xl border border-white/10 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Subtype</th>
                <th className="text-left px-4 py-2">{isGerman ? 'Grund' : 'Reason'}</th>
                <th className="text-left px-4 py-2">{isGerman ? 'Erstellt von' : 'Created by'}</th>
                <th className="text-left px-4 py-2">{isGerman ? 'Erstellt am' : 'Created at'}</th>
                <th className="w-16 px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {subtypeLoading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{isGerman ? 'Laden...' : 'Loading...'}</td></tr>
              )}
              {!subtypeLoading && subtypeExclusions.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{isGerman ? 'Keine Subtype-Ausnahmen definiert' : 'No subtype exclusions defined'}</td></tr>
              )}
              {subtypeExclusions.map((ex) => (
                <tr key={ex.id} className="hover:bg-white/5 transition">
                  <td className="px-4 py-2 font-mono font-medium">{ex.subtype}</td>
                  <td className="px-4 py-2 text-muted-foreground">{ex.reason || "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{ex.created_by}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {new Date(ex.created_at).toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDeleteSubtype(ex.id, ex.subtype)}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400 transition"
                      title={isGerman ? 'Entfernen' : 'Remove'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
