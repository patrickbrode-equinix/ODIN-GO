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

export type ExcelExportVariant = 'team' | 'management';

/** team = shifts only; management = hours (target/actual) and wish fulfilment (admins only). */
export async function exportPlanningGroup(groupId: string, variant: ExcelExportVariant = 'team') {
  const response = await api.get(`/shiftplan-control/drafts/groups/${encodeURIComponent(groupId)}/excel`, { responseType: 'blob', params: { variant } });
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
