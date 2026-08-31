/* ------------------------------------------------ */
/* COMPETENCY MODAL                                 */
/* Shows and manages employee competencies.         */
/* Opened from right-click context menu in Shiftplan*/
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Star, Plus, Trash2, ChevronDown, GraduationCap, Loader2 } from "lucide-react";
import { api } from "../../api/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useLanguage } from "../../context/LanguageContext";

/* ---- Types ---- */
interface Competency {
  id: number;
  employee_name: string;
  capability: string;
  level: 1 | 2 | 3;
  notes?: string;
}

/* ---- Star Rating ---- */
function StarRating({
  level,
  onChange,
}: {
  level: 1 | 2 | 3;
  onChange?: (v: 1 | 2 | 3) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {([1, 2, 3] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          className={`transition-colors ${n <= level ? "text-amber-400" : "text-white/15"} ${onChange ? "hover:text-amber-300 cursor-pointer" : "cursor-default"}`}
        >
          <Star className="w-4 h-4 fill-current" />
        </button>
      ))}
    </div>
  );
}

/* ---- Level label ---- */
const LEVEL_LABELS: Record<number, string> = {
  1: "Grundkenntnisse",
  2: "Fortgeschritten",
  3: "Experte",
};

/* ---- MODAL ---- */
interface Props {
  employeeName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CompetencyModal({ employeeName, isOpen, onClose }: Props) {
  const { t } = useLanguage();
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // New competency form
  const [newCapability, setNewCapability] = useState("");
  const [newLevel, setNewLevel] = useState<1 | 2 | 3>(1);
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!employeeName) return;
    setLoading(true);
    try {
      const res = await api.get(`/competencies/employee/${encodeURIComponent(employeeName)}`);
      setCompetencies(res.data?.competencies ?? []);
    } catch {
      setCompetencies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      load();
      setShowAdd(false);
      setNewCapability("");
      setNewLevel(1);
      setNewNotes("");
    }
  }, [isOpen, employeeName]);

  const handleAdd = async () => {
    if (!newCapability.trim()) return;
    setSaving(true);
    try {
      await api.post("/competencies", {
        employee_name: employeeName,
        capability: newCapability.trim(),
        level: newLevel,
        notes: newNotes.trim() || null,
      });
      setNewCapability("");
      setNewLevel(1);
      setNewNotes("");
      setShowAdd(false);
      await load();
    } catch (e) {
      console.error("Failed to add competency", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/competencies/${id}`);
      setCompetencies((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("Failed to delete competency", e);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[201] focus:outline-none">
          <div className="bg-[#080c1c] border border-blue-500/15 rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.8)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <GraduationCap className="w-5 h-5 text-indigo-400" />
                <div>
                  <Dialog.Title className="text-sm font-black tracking-wider uppercase text-white/90">
                    {t("competency.title")}
                  </Dialog.Title>
                  <p className="text-[11px] text-muted-foreground">{employeeName}</p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-white/5">
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                </div>
              )}

              {!loading && competencies.length === 0 && !showAdd && (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <GraduationCap className="w-10 h-10 opacity-20" />
                  <p className="text-sm">{t("competency.noCompetencies")}</p>
                </div>
              )}

              {!loading && competencies.map((c) => (
                <div key={c.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white/90 truncate">{c.capability}</span>
                      <StarRating level={c.level} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{LEVEL_LABELS[c.level]}</span>
                      {c.notes && (
                        <span className="text-[10px] text-indigo-300/70 truncate max-w-[180px]" title={c.notes}>
                          – {c.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 p-1 rounded transition-opacity"
                    title={t("common.delete")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Add Form */}
              {showAdd && (
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">{t("competency.newCompetency")}</p>
                  <Input
                    placeholder={t("competency.skillPlaceholder")}
                    value={newCapability}
                    onChange={(e) => setNewCapability(e.target.value)}
                    className="h-8 text-xs rounded-lg"
                    autoFocus
                  />
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{t("competency.level")}:</span>
                    <StarRating level={newLevel} onChange={setNewLevel} />
                    <span className="text-[11px] text-muted-foreground">{LEVEL_LABELS[newLevel]}</span>
                  </div>
                  <Input
                    placeholder={t("competency.notesPlaceholder")}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    className="h-8 text-xs rounded-lg"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setShowAdd(false)}
                      className="h-7 px-2 text-xs text-muted-foreground"
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm" onClick={handleAdd} disabled={saving || !newCapability.trim()}
                      className="h-7 px-3 text-xs bg-indigo-600/80 hover:bg-indigo-600 text-white"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : t("competency.add")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {!showAdd && (
              <div className="px-4 pb-4">
                <Button
                  onClick={() => setShowAdd(true)}
                  className="w-full h-8 text-xs font-bold bg-white/5 hover:bg-white/10 text-white/70 border border-white/10"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  {t("competency.addCompetency")}
                </Button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
