import { FolderKanban } from "lucide-react";
import { ProjectsPanel } from "../dashboard/ProjectsPanel";

export default function ProjectsPage() {
  return (
    <main className="min-h-full bg-slate-950 p-6 text-slate-100">
      <header className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Projekte</h1>
            <p className="mt-1 text-sm text-slate-400">Projektstatus, Beschreibung und beteiligte Mitarbeiter zentral pflegen.</p>
          </div>
        </div>
      </header>
      <ProjectsPanel />
    </main>
  );
}
