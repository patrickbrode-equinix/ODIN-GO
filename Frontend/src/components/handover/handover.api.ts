/* ------------------------------------------------ */
/* HANDOVER – API (NORMALIZED + UI SAFE)            */
/* ------------------------------------------------ */

import { api } from "../../api/api";
import { HandoverItem } from "./handover.types";

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function normalizeCommitAt(item: any): string | null {
  return (
    item.commitAt ??
    item.commit_at ??
    item.commitDate ??
    item.commitdate ??
    null
  );
}

/**
 * Status-Normalisierung
 * - übernimmt ALLE bekannten Backend-Status
 * - kein Fallback auf "Offen", wenn etwas bekannt ist
 */
function normalizeStatus(
  status?: string | null
): HandoverItem["status"] {
  switch (status) {
    case "Offen":
      return "Offen";
    case "Übernommen":
      return "Übernommen";
    case "In Bearbeitung":
      return "In Bearbeitung";
    case "Erledigt":
      return "Erledigt";
    default:
      // Unbekannt → defensiv offen anzeigen, aber NICHT überschreiben
      return "Offen";
  }
}

async function loadFilesSafe(handoverId: number) {
  try {
    const { data } = await api.get(`/handover/${handoverId}/files`);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.files)) return data.files;
    return [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------ */
/* LOAD HANDOVERS (CONSISTENT + SAFE)               */
/* ------------------------------------------------ */

export const loadHandovers = async (): Promise<HandoverItem[]> => {
  const { data } = await api.get("/handover");
  const items: any[] = data || [];

  const base: HandoverItem[] = items.map((item) => ({
    ...item,
    commitAt: normalizeCommitAt(item),
    status: normalizeStatus(item.status),
    files: [],
  }));

  await Promise.all(
    base.map(async (handover) => {
      if (!handover.id || handover.id < 0) return;
      handover.files = await loadFilesSafe(handover.id);
    })
  );

  return base;
};

/* ------------------------------------------------ */
/* CREATE                                           */
/* ------------------------------------------------ */

export const createHandover = async (item: HandoverItem) => {
  const { data } = await api.post("/handover", item);
  return data as HandoverItem;
};

/* ------------------------------------------------ */
/* UPDATE STATUS                                    */
/* ------------------------------------------------ */

export const takeOverHandover = async (
  id: number,
  takenBy: string
) => {
  await api.put(`/handover/${id}`, {
    status: "Übernommen",
    takenBy,
  });
};

export const completeHandover = async (
  id: number,
  takenBy: string
) => {
  await api.put(`/handover/${id}`, {
    status: "Erledigt",
    takenBy,
  });
};

export const restoreHandover = async (id: number) => {
  await api.put(`/handover/${id}`, {
    status: "Offen",
    takenBy: null,
  });
};

/* ------------------------------------------------ */
/* DELETE                                           */
/* ------------------------------------------------ */

export const deleteHandover = async (id: number) => {
  await api.delete(`/handover/${id}`);
};

/* ------------------------------------------------ */
/* FILE UPLOAD                                      */
/* ------------------------------------------------ */

export const uploadFiles = async (
  handoverId: number,
  files: FileList | null
) => {
  if (!files || files.length === 0) return;

  const fd = new FormData();
  Array.from(files).forEach((file) => {
    fd.append("files", file);
  });

  await api.post(`/handover/${handoverId}/upload`, fd);
};
