import { FolderKanban } from "lucide-react";
import { ProjectsPanel } from "../dashboard/ProjectsPanel";
import { useLanguage } from "../../context/LanguageContext";

export default function ProjectsPage() {
  const { language } = useLanguage();
  const isGerman = language === "de";
  return (
    <main className="min-h-full bg-slate-950 p-6 text-slate-100">
      <header className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">{isGerman ? "Projekte" : "Projects"}</h1>
            <p className="mt-1 text-sm text-slate-400">{isGerman ? "Projektstatus, Beschreibung und beteiligte Mitarbeiter zentral pflegen." : "Manage project status, descriptions, and participating employees in one place."}</p>
          </div>
        </div>
      </header>
      <ProjectsPanel />
    </main>
  );
}
