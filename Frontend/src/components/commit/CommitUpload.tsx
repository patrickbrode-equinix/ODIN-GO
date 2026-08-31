/* ------------------------------------------------ */
/* COMMIT FILE UPLOAD – HEADLESS                    */
/* ------------------------------------------------ */

import * as XLSX from "xlsx";

function parseCSV(csvText: string) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const delimiter = lines[0].includes(";")
    ? ";"
    : lines[0].includes("	")
    ? "	"
    : ",";
  const header = lines[0].split(delimiter).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cols = line.split(delimiter).map((c) => c.trim());
    const row: any = {};
    header.forEach((h, i) => (row[h.trim()] = cols[i]?.trim() ?? ""));
    return row;
  });
}

async function loadFile(file: File) {
  const buffer = await file.arrayBuffer();
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { raw: false });
  } catch {
    return parseCSV(new TextDecoder("utf-8").decode(buffer));
  }
}

export async function uploadCommitFile(
  file: File,
  onData: (rows: any[]) => void
) {
  const data = await loadFile(file);
  onData(data);
}
