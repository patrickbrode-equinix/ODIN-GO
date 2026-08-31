/* ================================================ */
/* Frontend API: Shift Verification                 */
/* ================================================ */

import axios from "axios";

const BASE = "/api/verification";

export interface VerificationSettings {
  enabled: boolean;
  delayMinutes: number;
  timeoutMinutes: number;
  pendingBlocksAssignment: boolean;
  autoAbsentOnSick: boolean;
  autoAbsentOnNoResponse: boolean;
}

export interface VerificationRecord {
  id: number;
  employee_name: string;
  date: string;
  shift_code: string;
  status: string;
  message_sent_at: string | null;
  responded_at: string | null;
  response_raw: string | null;
  delivery_error: string | null;
  initiated_by: string;
  override_by: string | null;
  override_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface VerificationAuditEntry {
  id: number;
  verification_id: number | null;
  employee_name: string;
  date: string;
  shift_code: string;
  event_type: string;
  old_status: string | null;
  new_status: string | null;
  payload: Record<string, unknown> | null;
  actor: string;
  created_at: string;
}

export const VerificationApi = {
  /** Get current settings */
  async getSettings(): Promise<VerificationSettings> {
    const { data } = await axios.get(`${BASE}/settings`);
    return data;
  },

  /** Update settings */
  async updateSettings(updates: Partial<VerificationSettings>): Promise<VerificationSettings> {
    const { data } = await axios.put(`${BASE}/settings`, updates);
    return data;
  },

  /** Get today's verification records */
  async getToday(): Promise<{ records: VerificationRecord[]; settings: VerificationSettings; date: string }> {
    const { data } = await axios.get(`${BASE}/today`);
    return data;
  },

  /** Get records for a specific date */
  async getByDate(date: string): Promise<{ records: VerificationRecord[]; date: string }> {
    const { data } = await axios.get(`${BASE}/date/${date}`);
    return data;
  },

  /** Get single employee verification */
  async getEmployee(name: string): Promise<VerificationRecord | { status: string }> {
    const { data } = await axios.get(`${BASE}/employee/${encodeURIComponent(name)}`);
    return data;
  },

  /** Manual override */
  async override(params: {
    employeeName: string;
    date: string;
    shiftCode: string;
    status: string;
    reason?: string;
  }): Promise<VerificationRecord> {
    const { data } = await axios.post(`${BASE}/override`, params);
    return data;
  },

  /** Manually trigger verification cycle */
  async trigger(): Promise<{ triggered: number; skipped: number; failed: number; timedOut: number; errors: string[] }> {
    const { data } = await axios.post(`${BASE}/trigger`);
    return data;
  },

  /** Get audit log */
  async getAudit(params?: { date?: string; employeeName?: string; limit?: number; offset?: number }): Promise<{ entries: VerificationAuditEntry[] }> {
    const { data } = await axios.get(`${BASE}/audit`, { params });
    return data;
  },
};
