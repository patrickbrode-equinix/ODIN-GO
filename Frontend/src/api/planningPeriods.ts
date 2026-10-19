import { api } from './api';

export interface PlanningDraftSummary {
  id: number;
  month: string;
  version: number;
  status: string;
  title?: string | null;
  description?: string | null;
  note?: string | null;
  created_at: string;
  created_by?: string;
  feedback_count?: number;
  approve_votes?: number;
  needs_changes_votes?: number;
}

export interface PlanningDraftGroup<D extends PlanningDraftSummary = PlanningDraftSummary> {
  id: string;
  type: 'month' | 'quarter' | 'year';
  year: number;
  quarter: number | null;
  title?: string | null;
  description?: string | null;
  created_at: string;
  drafts: D[];
}

export interface PlanningMetadataInput {
  title?: string | null;
  description?: string | null;
}

export async function updateDraftMetadata(id: number, metadata: PlanningMetadataInput) {
  const response = await api.patch(`/shiftplan-control/drafts/${id}/metadata`, metadata);
  return response.data as { ok: boolean; draft: any };
}

export async function updateGroupMetadata(groupId: string, metadata: PlanningMetadataInput) {
  const response = await api.patch(`/shiftplan-control/drafts/groups/${encodeURIComponent(groupId)}/metadata`, metadata);
  return response.data as { ok: boolean; updated: number };
}

/** True for real batch ids (quarter/year runs) that can carry their own metadata. */
export function isEditableGroupId(groupId: string) {
  return !groupId.startsWith('month:') && !groupId.startsWith('legacy-year:');
}

/** Deletes drafts one by one. Activated drafts cannot be deleted; the result lists what worked and what did not. */
export async function deletePlanningDrafts(ids: number[]) {
  const deleted: number[] = [];
  const failed: { id: number; message: string }[] = [];
  for (const id of ids) {
    try {
      await api.delete(`/shiftplan-control/drafts/${id}`);
      deleted.push(id);
    } catch (error: any) {
      failed.push({ id, message: error?.response?.data?.error || error?.message || 'Fehler' });
    }
  }
  return { deleted, failed };
}

export type ExcelExportVariant = 'team' | 'management';

/** Content of the management Excel: the admin chooses before every export. */
export interface ExcelExportInclude {
  /** Soll / Ist / Differenz */
  hours: boolean;
  /** Wish fulfilment and the sheet with every single wish */
  wishes: boolean;
  /** Whether wishes were submitted (employees without wishes are highlighted) */
  wishStatus: boolean;
}

export const DEFAULT_EXCEL_INCLUDE: ExcelExportInclude = { hours: true, wishes: true, wishStatus: true };
const EXCEL_INCLUDE_STORAGE_KEY = 'odin.excelExportInclude';

/** The last choice is remembered on this computer. */
export function loadExcelInclude(): ExcelExportInclude {
  try {
    const raw = window.localStorage.getItem(EXCEL_INCLUDE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EXCEL_INCLUDE };
    const parsed = JSON.parse(raw);
    return {
      hours: parsed?.hours !== false,
      wishes: parsed?.wishes !== false,
      wishStatus: parsed?.wishStatus !== false,
    };
  } catch {
    return { ...DEFAULT_EXCEL_INCLUDE };
  }
}

export function saveExcelInclude(include: ExcelExportInclude) {
  try { window.localStorage.setItem(EXCEL_INCLUDE_STORAGE_KEY, JSON.stringify(include)); } catch { /* storage may be unavailable */ }
}

/** Query value for ?include=… of the management export (hours,wishes,wishStatus). */
export function excelIncludeParam(include: ExcelExportInclude): string {
  return [include.hours ? 'hours' : '', include.wishes ? 'wishes' : '', include.wishStatus ? 'wishStatus' : ''].filter(Boolean).join(',');
}

export function excelExportParams(variant: ExcelExportVariant, include?: ExcelExportInclude) {
  return variant === 'management' && include ? { variant, include: excelIncludeParam(include) } : { variant };
}

/** team = shifts only; management = hours (target/actual) and wish fulfilment (admins only). */
export async function exportPlanningGroup(groupId: string, variant: ExcelExportVariant = 'team', include?: ExcelExportInclude) {
  const response = await api.get(`/shiftplan-control/drafts/groups/${encodeURIComponent(groupId)}/excel`, { responseType: 'blob', params: excelExportParams(variant, include) });
  const filename = String(response.headers?.['content-disposition'] || '').match(/filename="?([^";]+)"?/)?.[1] || 'ODIN_Planung.xlsx';
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}