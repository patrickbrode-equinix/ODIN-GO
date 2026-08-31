/* ------------------------------------------------ */
/* HANDOVER – FILES                                 */
/* ------------------------------------------------ */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { useLanguage } from "../../context/LanguageContext";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

interface FileItem {
  id: number;
  filename: string;
  url: string;
}

interface Props {
  files: FileItem[];
}

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

function HandoverFilesComponent({ files }: Props) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------ */
  /* CLOSE ON OUTSIDE CLICK                           */
  /* ------------------------------------------------ */

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  /* ------------------------------------------------ */
  /* HANDLERS                                        */
  /* ------------------------------------------------ */

  const toggleOpen = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const handleFileClick = useCallback(async (file: FileItem) => {
    const url = file.url;

    // Preview
    window.open(url, "_blank", "noopener,noreferrer");

    // Download
    const res = await fetch(url);
    const blob = await res.blob();

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }, []);

  /* ------------------------------------------------ */
  /* GUARD                                           */
  /* ------------------------------------------------ */

  if (!files || files.length === 0) return null;

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <div className="relative" ref={ref}>
      <Button
        size="sm"
        variant="outline"
        onClick={toggleOpen}
      >
        {language === "de" ? `Anhänge (${files.length})` : `Attachments (${files.length})`}
      </Button>

      {open && (
        <div className="absolute right-0 mt-2 bg-background border rounded-xl shadow p-2 w-64 z-50 max-h-72 overflow-auto">
          {files.map((file) => (
            <button
              key={file.id}
              type="button"
              className="block w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm"
              onClick={() => handleFileClick(file)}
            >
              {file.filename}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------ */
/* MEMO EXPORT                                      */
/* ------------------------------------------------ */

export const HandoverFiles = memo(
  HandoverFilesComponent,
  (prev, next) => prev.files === next.files
);
