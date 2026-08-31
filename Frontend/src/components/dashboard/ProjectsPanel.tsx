/* ---------------------------------------------------- */
/* PROJECTS MODULE                                      */
/* Used in InfoModal (Projects tab) + TV Dashboard      */
/* ---------------------------------------------------- */

import { useEffect, useState } from "react";
import { api } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { getUserDisplayName } from "../../utils/userDisplay";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Plus, Pencil, Check, X, FolderKanban, Calendar, User } from "lucide-react";

/* ---------------------------------------------------- */
/* TYPES                                               */
/* ---------------------------------------------------- */

interface Project {
  id: number;
  name: string;
  creator: string;
  responsible: string | null;
  expected_done: string | null;
  progress: number;
  description: string | null;
  status: string;
  created_at: string;
  participants: string[];
}

/* ---------------------------------------------------- */
/* PROGRESS BAR                                        */
/* ---------------------------------------------------- */

function ProgressBar({ progress, mini = false }: { progress: number; mini?: boolean }) {
  const pct = Math.max(0, Math.min(100, progress));
  const color =
    pct >= 100 ? "#10b981"
    : pct >= 75 ? "#3b82f6"
    : pct >= 40 ? "#f59e0b"
    : "#f43f5e";

  const glow =
    pct >= 100 ? "rgba(16,185,129,0.5)"
    : pct >= 75 ? "rgba(59,130,246,0.5)"
    : pct >= 40 ? "rgba(245,158,11,0.5)"
    : "rgba(244,63,94,0.5)";

  return (
    <div
      className="w-full rounded-full bg-white/10"
      style={{ height: mini ? 6 : 10 }}
    >
      <div
        className="rounded-full transition-all duration-700"
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          boxShadow: `0 0 8px ${glow}`,
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------- */
/* CREATE PROJECT FORM                                 */
/* ---------------------------------------------------- */

function CreateProjectForm({
  onCreated,
  onCancel,
  defaultCreator,
  employees,
}: {
  onCreated: (p: Project) => void;
  onCancel: () => void;
  defaultCreator: string;
  employees: string[];
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [responsible, setResponsible] = useState("");
  const [expectedDone, setExpectedDone] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post("/projects", {
        name,
        creator: defaultCreator,
        responsible: responsible || null,
        expected_done: expectedDone || null,
        progress,
        description: description || null,
        participants,
      });
      onCreated(data);
    } catch (err) {
      console.error("Failed to create project", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3"
    >
      <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
        <FolderKanban className="w-4 h-4 text-blue-400" />
        {t("projects.createNewProject")}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">{t("projects.projectNameLabel")}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("projects.projectNamePlaceholder")}
            required
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-400">{t("projects.responsibleLabel")}</Label>
          <Input
            value={responsible}
            onChange={(e) => setResponsible(e.target.value)}
            placeholder={t("projects.responsiblePlaceholder")}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-400">{t("projects.endDateLabel")}</Label>
          <Input
            type="date"
            value={expectedDone}
            onChange={(e) => setExpectedDone(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-400">{t("projects.progressLabel")}: {progress}%</Label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">{t("projects.descriptionLabel")}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("projects.descriptionPlaceholder")}
          rows={2}
          className="text-sm resize-none"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Teilnehmende Mitarbeiter</Label>
        <select multiple value={participants} onChange={(event) => setParticipants([...event.currentTarget.selectedOptions].map((option) => option.value))} className="min-h-32 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
          {employees.map((employee) => <option key={employee} value={employee}>{employee}</option>)}
        </select>
        <p className="text-[11px] text-slate-500">Mehrere Einträge mit Strg oder Umschalt auswählen.</p>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-slate-400 hover:text-white"
        >
          {t("common.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? t("common.saving") : t("projects.createProjectButton")}
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------- */
/* EDIT PROGRESS INLINE                                */
/* ---------------------------------------------------- */

function ProjectCard({
  project,
  onUpdated,
  onDeleted,
}: {
  project: Project;
  onUpdated: (p: Project) => void;
  onDeleted: (id: number) => void;
}) {
  const { language, t } = useLanguage();
  const locale = language === "de" ? "de-DE" : "en-US";
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState(project.progress);
  const [saving, setSaving] = useState(false);

  const handleSaveProgress = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/projects/${project.id}`, { progress });
      onUpdated(data);
      setEditing(false);
    } catch (err) {
      console.error("Failed to update progress", err);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!window.confirm(t("projects.markCompletedConfirm"))) return;
    try {
      const { data } = await api.patch(`/projects/${project.id}`, { progress: 100, status: "completed" });
      onUpdated(data);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async () => {
    if (!window.confirm(language === "de" ? `Projekt "${project.name}" wirklich löschen?` : `Delete project "${project.name}"?`)) return;
    try {
      await api.delete(`/projects/${project.id}`);
      onDeleted(project.id);
    } catch (err) { console.error(err); }
  };

  const daysLeft = project.expected_done
    ? Math.ceil((new Date(project.expected_done).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const daysColor =
    daysLeft === null ? "text-slate-500"
    : daysLeft < 0 ? "text-red-400"
    : daysLeft < 7 ? "text-orange-400"
    : "text-slate-300";

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 hover:border-blue-500/20 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-200 text-[14px]">{project.name}</h3>
            {project.status === "completed" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                {t("projects.completedBadge")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {project.responsible && (
              <span className="flex items-center gap-1 text-[12px] text-slate-400">
                <User className="w-3 h-3" />
                {project.responsible}
              </span>
            )}
            {project.expected_done && (
              <span className={`flex items-center gap-1 text-[12px] ${daysColor}`}>
                <Calendar className="w-3 h-3" />
                {new Date(project.expected_done).toLocaleDateString(locale, { timeZone: 'Europe/Berlin' })}
                {daysLeft !== null && (
                  <span className="ml-1 text-[11px]">
                    ({daysLeft < 0 ? `${Math.abs(daysLeft)}d ${t("projects.overdue")}` : daysLeft === 0 ? t("projects.today") : `${daysLeft}d`})
                  </span>
                )}
              </span>
            )}
            <span className="text-[12px] text-slate-500">{project.creator}</span>
          </div>

          {project.description && (
            <p className="text-[12px] text-slate-400 mt-1 line-clamp-2">{project.description}</p>
          )}
          {project.participants?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{project.participants.map((participant) => <span key={participant} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300">{participant}</span>)}</div> : null}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {project.status !== "completed" && (
            <button
              onClick={handleComplete}
              className="p-1.5 rounded-lg hover:bg-green-500/20 text-slate-500 hover:text-green-400 transition"
              title={t("projects.markCompletedConfirm")}
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 transition"
            title={t("projects.progressLabel")}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition"
            title={t("common.cancel")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* PROGRESS */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-slate-500">{t("projects.progressLabel")}</span>
          <span className="font-bold text-slate-300">{editing ? progress : project.progress}%</span>
        </div>
        <ProgressBar progress={editing ? progress : project.progress} />
      </div>

      {/* INLINE EDIT */}
      {editing && (
        <div className="pt-1 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <Button
            size="sm"
            onClick={handleSaveProgress}
            disabled={saving}
            className="h-7 px-3 text-xs"
          >
            {saving ? "..." : "OK"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setEditing(false); setProgress(project.progress); }}
            className="h-7 px-3 text-xs text-slate-400"
          >
            ✕
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------- */
/* MAIN EXPORT                                         */
/* ---------------------------------------------------- */

export function ProjectsPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [employees, setEmployees] = useState<string[]>([]);

  useEffect(() => {
    loadProjects();
    api.get("/projects/employees").then(({ data }) => setEmployees(Array.isArray(data?.employees) ? data.employees : [])).catch(() => setEmployees([]));
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/projects");
      setProjects(data);
    } catch (err) {
      console.error("Failed to load projects", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreated = (p: Project) => {
    setProjects((prev) => [p, ...prev]);
    setShowCreate(false);
  };

  const handleUpdated = (p: Project) => {
    setProjects((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  };

  const handleDeleted = (id: number) => {
    setProjects((prev) => prev.filter((x) => x.id !== id));
  };

  const displayName = getUserDisplayName(user) || "Unknown";

  const active = projects.filter((p) => p.status === "active");
  const completed = projects.filter((p) => p.status === "completed");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
        {t("projects.loadingLabel")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* CREATE BUTTON */}
      {!showCreate && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="gap-2 h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("projects.newProjectButton")}
          </Button>
        </div>
      )}

      {showCreate && (
        <CreateProjectForm
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
          defaultCreator={displayName}
          employees={employees}
        />
      )}

      {/* ACTIVE */}
      {active.length > 0 && (
        <div className="space-y-2">
          {!compact && (
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {t("projects.activeSection")} ({active.length})
            </h3>
          )}
          {active.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {/* COMPLETED */}
      {!compact && completed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {t("projects.completedSection")} ({completed.length})
          </h3>
          {completed.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {active.length === 0 && completed.length === 0 && !showCreate && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
          <FolderKanban className="w-12 h-12 opacity-20" />
          <p className="text-sm">{t("projects.noProjects")}</p>
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            {t("projects.createFirstButton")}
          </Button>
        </div>
      )}
    </div>
  );
}

/* Compact card for TV dashboard */
export function ProjectCardCompact({ project }: { project: Project }) {
  const { t } = useLanguage();
  const daysLeft = project.expected_done
    ? Math.ceil((new Date(project.expected_done).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-[13px] text-slate-200 truncate">{project.name}</span>
        <span className="text-[11px] font-bold text-blue-400 shrink-0">{project.progress}%</span>
      </div>
      {project.responsible && (
        <p className="text-[11px] text-slate-400 truncate">{project.responsible}</p>
      )}
      <ProgressBar progress={project.progress} mini />
      {daysLeft !== null && (
        <p className={`text-[11px] ${daysLeft < 0 ? "text-red-400" : "text-slate-500"}`}>
          {daysLeft < 0 ? `${Math.abs(daysLeft)}d ${t("projects.overdue")}` : daysLeft === 0 ? t("projects.today") : `${daysLeft}d`}
        </p>
      )}
    </div>
  );
}
