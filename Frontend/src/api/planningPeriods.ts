import { api } from './api';

export interface PlanningDraftSummary {
  id: number;
  month: string;
  version: number;
  status: string;
  title?: string | null;
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
  created_at: string;
  drafts: D[];
}

export async function exportPlanningGroup(groupId: string) {
  const response = await api.get(`/shiftplan-control/drafts/groups/${encodeURIComponent(groupId)}/excel`, { responseType: 'blob' });
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
