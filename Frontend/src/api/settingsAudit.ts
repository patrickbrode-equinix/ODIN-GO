/* ------------------------------------------------ */
/* Settings Audit API Client                        */
/* ------------------------------------------------ */

import { api } from "./api";

export interface SettingsAuditEntry {
  id: number;
  domain: string;
  setting_key: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  change_note: string | null;
  created_at: string;
}

export async function fetchSettingsAudit(params?: {
  domain?: string;
  key?: string;
  changed_by?: string;
  start?: string;
  end?: string;
  limit?: number;
  offset?: number;
}): Promise<SettingsAuditEntry[]> {
  const { data } = await api.get("/admin/settings-audit", { params });
  return data;
}
