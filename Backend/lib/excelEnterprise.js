/* ================================================ */
/* Excel look and feel ("enterprise" layout)         */
/*                                                   */
/* One design for every sheet of the export:         */
/*  - cover sheet "Übersicht": key figures, table of */
/*    contents with links, legend of shifts / marks  */
/*  - every other sheet: dark title band, tab colour */
/*    per sheet group, no grid lines, print setup    */
/*    (landscape, fit to width, header and footer)   */
/* Pure styling: no cell value of the data sheets is */
/* changed.                                          */
/* ================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OVERVIEW_SHEET_NAME = 'Übersicht';
export const WORKBOOK_TITLE = 'FR2 Schichtplan';

/** Optional company logo: drop the official PNG at Backend/assets/equinix-logo.png and it appears on the cover sheet. */
export const LOGO_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'equinix-logo.png');

/** Width and height of a PNG file (IHDR chunk) or null. */
export function readPngSize(filePath) {
  try {
    const header = fs.readFileSync(filePath).subarray(0, 24);
    if (header.length < 24 || header.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } catch {
    return null;
  }
}

export const THEME = Object.freeze({
  navy: '1E3A5F',
  blue: '2F5D8C',
  teal: '0F766E',
  grey: '6B7280',
  light: 'EEF2F7',
  line: 'D1D5DB',
  white: 'FFFFFF',
  warn: 'B45309',
  ok: '047857',
  bad: 'B91C1C',
});

const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: THEME.line } };
const box = { top: thin, bottom: thin, left: thin, right: thin };

const MONTH_SHEET = /^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) \d{4}$/;

/** Sheet group: decides the tab colour and the description in the table of contents. */
export function describeSheet(name) {
  if (MONTH_SHEET.test(name)) return { group: 'plan', text: `Monatsplan ${name}: Schicht pro Mitarbeiter und Tag, Colo und Überbesetzung markiert.` };
  const known = {
    'Fortlaufender Plan': { group: 'plan', text: 'Alle Monate lückenlos hintereinander (Jahresplan): Schicht, Urlaub und Krank pro Mitarbeiter und Tag.' },
    'Stunden & Wünsche': { group: 'analysis', text: 'Soll-/Ist-Stunden und Wunscherfüllung je Mitarbeiter und Monat, Gesamtsummen.' },
    Gesamt: { group: 'analysis', text: 'Summen je Mitarbeiter über alle enthaltenen Monate (Soll, Ist, Differenz, Wunscherfüllung).' },
    Stunden: { group: 'analysis', text: 'Soll-/Ist-Stunden je Mitarbeiter und Monat.' },
    Wünsche: { group: 'analysis', text: 'Wunscherfüllung je Mitarbeiter und Monat.' },
    'Wunsch-Status': { group: 'analysis', text: 'Wer Wünsche abgegeben hat (gelb = keine Wünsche).' },
    Wunschdetails: { group: 'analysis', text: 'Jeder einzelne Wunsch und ob er erfüllt wurde.' },
    Kostenkontrolle: { group: 'analysis', text: 'Nacht-, Sonntags- und Feiertagszuschläge je Woche, Monat, Quartal und Mitarbeiter; Feiertage im Detail und ihre Verteilung.' },
    Schichtverteilung: { group: 'analysis', text: 'Anteil von Früh, Spät, Nacht und Wochenende je Mitarbeiter, absolut und in Prozent, als Balken.' },
    'Colo-Abdeckung': { group: 'analysis', text: 'Pro Tag: welche Colo-Aufgaben besetzt sind, was fehlt.' },
    Einstellungen: { group: 'settings', text: 'Regler und Besetzungsgrenzen, mit denen jeder Entwurf erzeugt wurde.' },
    Jahresübersicht: { group: 'settings', text: 'Kurzübersicht der enthaltenen Monate (Version, Status, Schichten, Konflikte).' },
    Quartalsübersicht: { group: 'settings', text: 'Kurzübersicht der enthaltenen Monate (Version, Status, Schichten, Konflikte).' },
  };
  return known[name] || { group: 'settings', text: '' };
}

/** Sheets that are tables (not plan grids): their columns are sized once, here, so nobody has to widen them. */
const TABLE_SHEETS = new Set([
  'Stunden & Wünsche', 'Stunden', 'Wünsche', 'Wunsch-Status', 'Gesamt', 'Wunschdetails', 'Kostenkontrolle',
  'Colo-Abdeckung', 'Einstellungen', 'Jahresübersicht', 'Quartalsübersicht',
]);

function cellText(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    const format = String(cell.numFmt || '');
    if (format.includes('%')) return `${(value * 100).toFixed(format.includes('0.0') ? 1 : 0)} %`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((part) => part.text).join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (value instanceof Date) return '31.12.2027';
    return '';
  }
  return String(value);
}

/**
 * Column widths from the real content: wide enough for every value (headers may wrap), never wider than maxWidth.
 * Text that is still longer wraps inside its cell and the row gets the height it needs. Title and note rows (one value
 * or merged) are ignored.
 */
export function autoLayoutColumns(ws, { minWidth = 9, maxWidth = 44 } = {}) {
  const need = new Map(); // column -> { body, header }
  const longestWord = (text) => text.split(/[\s/]+/).reduce((max, word) => Math.max(max, word.length), 0);
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = [];
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      if (cell.isMerged && cell.master !== cell) return;
      if (cell.isMerged) return;
      if (cellText(cell) !== '') cells.push({ cell, column });
    });
    if (cells.length < 2) return;
    rows.push({ rowNumber, cells });
    for (const { cell, column } of cells) {
      const text = cellText(cell);
      const isHeader = cell.font?.bold === true && /FFFFFF$/.test(String(cell.font?.color?.argb || ''));
      const entry = need.get(column) || { body: 0, header: 0 };
      if (isHeader) entry.header = Math.max(entry.header, longestWord(text) * 1.1 + 3);
      else entry.body = Math.max(entry.body, text.split('\n').reduce((max, line) => Math.max(max, line.length), 0) * 1.08 + 2.5);
      need.set(column, entry);
    }
  });
  const filterPadding = ws.autoFilter ? 3 : 0;
  const widthOf = new Map();
  for (const [column, entry] of need) {
    widthOf.set(column, Math.min(Math.max(Math.max(entry.body, entry.header + filterPadding), minWidth), maxWidth));
    ws.getColumn(column).width = Number(widthOf.get(column).toFixed(1));
  }
  // wrap what does not fit and give the row the height it needs
  for (const { rowNumber, cells } of rows) {
    let lines = 1;
    for (const { cell, column } of cells) {
      const text = cellText(cell);
      const width = widthOf.get(column) || minWidth;
      const isHeader = cell.font?.bold === true && /FFFFFF$/.test(String(cell.font?.color?.argb || ''));
      const needed = isHeader ? Math.ceil((text.length * 1.1 + 3) / width) : Math.ceil((text.length * 1.08 + 2.5) / width);
      if (needed > 1) {
        cell.alignment = { ...(cell.alignment || {}), wrapText: true, vertical: isHeader ? 'middle' : 'top' };
        lines = Math.max(lines, needed);
      }
    }
    const row = ws.getRow(rowNumber);
    if (lines > 1) row.height = Math.max(Number(row.height) || 15, lines * 13.5 + 3);
  }
}

const TAB_COLORS = { overview: THEME.navy, plan: '2F6FB5', analysis: '0F9D8A', settings: '9CA3AF' };

function safeName(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

/**
 * Applies the common look to every sheet except the cover. options: { variantLabel, generatedLabel }.
 */
export function applyEnterpriseLayout(workbook, { variantLabel = '', generatedLabel = '' } = {}) {
  workbook.company = 'Equinix';
  workbook.title = WORKBOOK_TITLE;
  workbook.subject = variantLabel;
  workbook.keywords = 'Schichtplan, ODIN';
  for (const ws of workbook.worksheets) {
    if (ws.name === OVERVIEW_SHEET_NAME) continue;
    const { group } = describeSheet(ws.name);
    ws.properties.tabColor = { argb: TAB_COLORS[group] || TAB_COLORS.settings };

    // Title band
    const title = ws.getCell(1, 1);
    const width = Math.min(Math.max(ws.columnCount, 6), 40);
    if (!title.isMerged) {
      for (let column = 1; column <= width; column++) ws.getCell(1, column).fill = solid(THEME.navy);
    }
    title.fill = solid(THEME.navy);
    title.font = { name: 'Calibri', size: 15, bold: true, color: { argb: THEME.white } };
    title.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 32;

    if (TABLE_SHEETS.has(ws.name)) autoLayoutColumns(ws, ws.name === 'Kostenkontrolle' ? { maxWidth: 30 } : {});

    // Calm background: no grid lines, keep the frozen panes of the sheet
    const views = Array.isArray(ws.views) && ws.views.length > 0 ? ws.views : [{}];
    ws.views = views.map((view) => ({ ...view, showGridLines: false }));

    // Print: landscape, one page wide, repeated title rows, header and footer
    ws.pageSetup = {
      ...ws.pageSetup,
      orientation: 'landscape',
      paperSize: ws.pageSetup?.paperSize || 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.6, bottom: 0.6, header: 0.25, footer: 0.25 },
    };
    ws.headerFooter = {
      oddHeader: `&L&"Calibri,Bold"&10${WORKBOOK_TITLE}&R&9${variantLabel}`,
      oddFooter: `&L&9${ws.name}&C&9Seite &P von &N&R&9Exportiert ${generatedLabel}`,
    };
  }
}

function tile(ws, row, column, { label, value, numFmt, note, tone = THEME.navy }) {
  ws.mergeCells(row, column, row, column + 1);
  ws.mergeCells(row + 1, column, row + 1, column + 1);
  ws.mergeCells(row + 2, column, row + 2, column + 1);
  const labelCell = ws.getCell(row, column);
  labelCell.value = String(label).toUpperCase();
  labelCell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: THEME.grey } };
  labelCell.alignment = { horizontal: 'left', vertical: 'bottom', indent: 1 };
  const valueCell = ws.getCell(row + 1, column);
  valueCell.value = value;
  if (numFmt) valueCell.numFmt = numFmt;
  valueCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: tone } };
  valueCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  const noteCell = ws.getCell(row + 2, column);
  noteCell.value = note || ' ';
  noteCell.font = { name: 'Calibri', size: 8, color: { argb: THEME.grey } };
  noteCell.alignment = { horizontal: 'left', vertical: 'top', indent: 1, wrapText: true };
  for (let offset = 0; offset < 3; offset++) {
    for (let step = 0; step < 2; step++) {
      const cell = ws.getCell(row + offset, column + step);
      cell.fill = solid(THEME.light);
      cell.border = {
        top: offset === 0 ? { style: 'medium', color: { argb: tone } } : undefined,
        bottom: offset === 2 ? thin : undefined,
        left: step === 0 ? thin : undefined,
        right: step === 1 ? thin : undefined,
      };
    }
  }
  ws.getRow(row + 1).height = 30;
  ws.getRow(row + 2).height = 24;
}

function sectionTitle(ws, row, text) {
  ws.mergeCells(row, 2, row, 9);
  const cell = ws.getCell(row, 2);
  cell.value = text;
  cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: THEME.navy } };
  cell.alignment = { vertical: 'middle' };
  for (let column = 2; column <= 9; column++) ws.getCell(row, column).border = { bottom: { style: 'medium', color: { argb: THEME.navy } } };
  ws.getRow(row).height = 22;
}

/**
 * Fills the cover sheet.
 * context: { title, periodLabel, variantLabel, confidential, generatedLabel, kpis: [{ label, value, note, tone }],
 *            shifts: [{ code, name, time, hours, type }], marks: [{ sample, fill, font, text }], colorFor(code) }
 */
export function buildOverviewSheet(workbook, ws, context) {
  const { title, periodLabel, variantLabel, confidential, generatedLabel, generatedAtLabel = generatedLabel, createdBy = '', exportedBy = '', logoPath = LOGO_PATH, kpis = [], shifts = [], marks = [], colorFor = () => null } = context;
  ws.properties.tabColor = { argb: TAB_COLORS.overview };
  ws.views = [{ showGridLines: false, zoomScale: 100 }];
  ws.getColumn(1).width = 2;
  ws.getColumn(2).width = 22;
  for (let column = 3; column <= 9; column++) ws.getColumn(column).width = 15;
  ws.getColumn(10).width = 2;

  // Title band: logo on the left, big title, big generation date, author
  for (let rowIndex = 1; rowIndex <= 3; rowIndex++) {
    for (let column = 1; column <= 10; column++) ws.getCell(rowIndex, column).fill = solid(rowIndex === 3 ? THEME.blue : THEME.navy);
  }
  ws.getRow(1).height = 40;
  ws.getRow(2).height = 28;
  ws.getRow(3).height = 22;
  // logo tile (white) over rows 1-2 of columns B:C
  ws.mergeCells(1, 2, 2, 3);
  for (let rowIndex = 1; rowIndex <= 2; rowIndex++) for (let column = 2; column <= 3; column++) ws.getCell(rowIndex, column).fill = solid(THEME.white);
  const logoSize = readPngSize(logoPath);
  let logoPlaced = false;
  if (logoSize) {
    try {
      const imageId = workbook.addImage({ filename: logoPath, extension: 'png' });
      const height = 44;
      const width = Math.min(Math.round((logoSize.width / logoSize.height) * height), 200);
      ws.addImage(imageId, { tl: { col: 1.08, row: 0.22 }, ext: { width, height }, editAs: 'oneCell' });
      logoPlaced = true;
    } catch {
      logoPlaced = false;
    }
  }
  if (!logoPlaced) {
    // Placeholder wordmark until the official logo file is added (see LOGO_PATH)
    const mark = ws.getCell(1, 2);
    mark.value = 'EQUINIX';
    mark.font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'ED1C24' } };
    mark.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  ws.mergeCells(1, 4, 1, 9);
  ws.getCell(1, 4).value = title;
  ws.getCell(1, 4).font = { name: 'Calibri', size: 28, bold: true, color: { argb: THEME.white } };
  ws.getCell(1, 4).alignment = { vertical: 'middle', indent: 1 };
  ws.mergeCells(2, 4, 2, 9);
  ws.getCell(2, 4).value = `Generiert am ${generatedAtLabel}`;
  ws.getCell(2, 4).font = { name: 'Calibri', size: 17, bold: true, color: { argb: 'FDE68A' } };
  ws.getCell(2, 4).alignment = { vertical: 'middle', indent: 1 };
  ws.mergeCells(3, 2, 3, 9);
  ws.getCell(3, 2).value = [createdBy ? `Erstellt von ${createdBy}` : null, periodLabel, variantLabel].filter(Boolean).join('   ·   ');
  ws.getCell(3, 2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: THEME.white } };
  ws.getCell(3, 2).alignment = { vertical: 'middle', indent: 1 };
  ws.mergeCells(4, 2, 4, 9);
  ws.getCell(4, 2).value = `Exportiert am ${generatedLabel}${exportedBy ? ` von ${exportedBy}` : ''}${confidential ? '  ·  Vertraulich: enthält Wunsch- und Stundendaten, nicht an das Team weitergeben' : ''}`;
  ws.getCell(4, 2).font = { name: 'Calibri', size: 9, italic: true, color: { argb: confidential ? THEME.warn : THEME.grey } };
  ws.getRow(4).height = 18;

  // Key figures
  let row = 6;
  sectionTitle(ws, row, 'Auf einen Blick');
  row += 1;
  for (let index = 0; index < kpis.length; index += 4) {
    kpis.slice(index, index + 4).forEach((entry, position) => tile(ws, row, 2 + position * 2, entry));
    row += 4;
  }

  // Table of contents with links
  row += 0;
  sectionTitle(ws, row, 'Inhalt dieser Datei');
  row += 1;
  ws.getCell(row, 2).value = 'Blatt';
  ws.mergeCells(row, 3, row, 9);
  ws.getCell(row, 3).value = 'Was sehen Sie hier?';
  for (let column = 2; column <= 9; column++) {
    const cell = ws.getCell(row, column);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: THEME.white } };
    cell.fill = solid(THEME.blue);
    cell.alignment = { vertical: 'middle', indent: 1 };
  }
  row += 1;
  const sheets = workbook.worksheets.filter((sheet) => sheet.name !== OVERVIEW_SHEET_NAME);
  sheets.forEach((sheet, index) => {
    const info = describeSheet(sheet.name);
    const link = ws.getCell(row, 2);
    link.value = { text: sheet.name, hyperlink: `#${safeName(sheet.name)}!A1`, tooltip: `Zu „${sheet.name}“ springen` };
    link.font = { name: 'Calibri', size: 10, bold: true, underline: true, color: { argb: '1D4ED8' } };
    link.alignment = { vertical: 'middle', indent: 1 };
    link.fill = solid(index % 2 === 0 ? THEME.white : 'F8FAFC');
    ws.mergeCells(row, 3, row, 9);
    const text = ws.getCell(row, 3);
    text.value = info.text;
    text.font = { name: 'Calibri', size: 10, color: { argb: '374151' } };
    text.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    for (let column = 2; column <= 9; column++) {
      const cell = ws.getCell(row, column);
      cell.border = { bottom: thin };
      cell.fill = solid(index % 2 === 0 ? THEME.white : 'F8FAFC');
    }
    ws.getRow(row).height = info.text.length > 95 ? 30 : 20;
    row += 1;
  });
  row += 1;

  // Legend of the shifts
  if (shifts.length > 0) {
    sectionTitle(ws, row, 'Legende: Schichten');
    row += 1;
    ws.mergeCells(row, 3, row, 5);
    [['Code', 2], ['Bezeichnung', 3], ['Zeit', 6], ['Stunden', 7], ['Art', 8]].forEach(([header, columnIndex]) => {
      const cell = ws.getCell(row, columnIndex);
      cell.value = header;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: THEME.white } };
      cell.fill = solid(THEME.blue);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    row += 1;
    for (const shift of shifts) {
      const colors = colorFor(shift.code);
      ws.mergeCells(row, 3, row, 5);
      [[shift.code, 2], [shift.name || '', 3], [shift.time || '', 6], [shift.hours ?? '', 7], [shift.type || '', 8]].forEach(([value, columnIndex], offset) => {
        const cell = ws.getCell(row, columnIndex);
        cell.value = value;
        cell.font = { name: 'Calibri', size: 10, bold: offset === 0, color: { argb: offset === 0 && colors ? colors.font : '1F2937' } };
        cell.alignment = { horizontal: offset === 1 ? 'left' : 'center', vertical: 'middle', indent: offset === 1 ? 1 : 0 };
        if (offset === 0 && colors) cell.fill = solid(colors.fill);
      });
      for (let columnIndex = 2; columnIndex <= 8; columnIndex++) ws.getCell(row, columnIndex).border = box;
      row += 1;
    }
    row += 1;
  }

  // Legend of the marks
  if (marks.length > 0) {
    sectionTitle(ws, row, 'Legende: Markierungen');
    row += 1;
    for (const mark of marks) {
      const sample = ws.getCell(row, 2);
      sample.value = mark.sample;
      sample.font = { name: 'Calibri', size: 10, bold: true, color: { argb: mark.font || '1F2937' } };
      sample.alignment = { horizontal: 'center', vertical: 'middle' };
      sample.border = mark.border || box;
      if (mark.fill) sample.fill = solid(mark.fill);
      ws.mergeCells(row, 3, row, 9);
      const text = ws.getCell(row, 3);
      text.value = mark.text;
      text.font = { name: 'Calibri', size: 10, color: { argb: '374151' } };
      text.alignment = { vertical: 'middle', indent: 1, wrapText: true };
      ws.getRow(row).height = 20;
      row += 1;
    }
  }

  ws.pageSetup = { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  ws.headerFooter = { oddFooter: `&L&9ODIN Schichtplan&C&9Seite &P von &N&R&9Exportiert ${generatedLabel}` };
}
