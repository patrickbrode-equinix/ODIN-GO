import { useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { api } from "../../api/api";
import { getLanguageLocale, useLanguage } from "../../context/LanguageContext";

type UploadInfo = {
  uploaded_at?: string | null;
  uploaded_by?: string | null;
};

export function ShiftplanUploadStatus({ className = "" }: { className?: string }) {
  const { language } = useLanguage();
  const [upload, setUpload] = useState<UploadInfo | null>(null);

  useEffect(() => {
    let active = true;
    void api.get("/schedules/last-upload")
      .then(({ data }) => { if (active) setUpload(data || null); })
      .catch(() => { if (active) setUpload(null); });
    return () => { active = false; };
  }, []);

  const isGerman = language === "de";
  const uploadedAt = upload?.uploaded_at ? new Date(upload.uploaded_at) : null;
  const dateLabel = uploadedAt && !Number.isNaN(uploadedAt.getTime())
    ? uploadedAt.toLocaleString(getLanguageLocale(language), { dateStyle: "short", timeStyle: "short" })
    : null;

  return (
    <div className={`inline-flex max-w-full items-center gap-1.5 rounded-md border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-100 ${className}`} title={dateLabel || undefined}>
      <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-sky-300" />
      <span className="whitespace-nowrap text-sky-100/80">{isGerman ? "Letzter Excel-Upload:" : "Last Excel upload:"}</span>
      {dateLabel ? <span className="truncate text-sky-50">{dateLabel}{upload?.uploaded_by ? ` · ${upload.uploaded_by}` : ""}</span> : <span className="text-sky-100/65">{isGerman ? "noch keiner" : "none yet"}</span>}
    </div>
  );
}
