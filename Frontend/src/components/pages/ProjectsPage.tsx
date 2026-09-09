import { FolderKanban } from "lucide-react";
import { ProjectsPanel } from "../dashboard/ProjectsPanel";
import { useLanguage } from "../../context/LanguageContext";

export default function ProjectsPage() {
  const { t } = useLanguage();
  return (
    <main className="min-h-full bg-slate-950 p-6 text-slate-100">
      <header className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">{t("projects.title")}</h1>
            <p className="mt-1 text-sm text-slate-400">{t("projects.subtitle")}</p>
          </div>
        </div>
      </header>
      <ProjectsPanel />
    </main>
  );
}
