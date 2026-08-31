/* ================================================ */
/* Assignment Writeback — Frontend API Service      */
/* ================================================ */

import { api } from './api';
import type {
  AssignmentAction,
  AssignmentAuditLog,
  WritebackSettings,
  ReconcileResult,
} from '../types/assignmentWriteback';

export interface AssignmentActionsListResult {
  actions: AssignmentAction[];
  settings: Pick<WritebackSettings, 'mode' | 'enabled' | 'killSwitch'>;
}

export interface ActionWithAudit {
  action: AssignmentAction;
  auditLogs: AssignmentAuditLog[];
  logs?: AssignmentAuditLog[]; // alias returned by /:id/audit
}

export interface AuditLogResult {
  logs: AssignmentAuditLog[];
}

export interface ValidateResult {
  valid: boolean;
  errors: string[];
}

export interface ApproveResult {
  approved: boolean;
}

export interface CancelResult {
  cancelled: boolean;
}

export interface ExecuteResult {
  success: boolean;
  status: string;
  reason?: string;
}

export const AssignmentWritebackApi = {
  /* ── List all actions ── */
  async listActions(params?: {
    executionStatus?: string;
    actionType?: string;
    executionMode?: string;
    limit?: number;
    offset?: number;
  }): Promise<AssignmentActionsListResult> {
    const res = await api.get('/assignment-actions', { params });
    return res.data;
  },

  /* ── Get single action + audit logs ── */
  async getAction(id: number): Promise<ActionWithAudit> {
    const res = await api.get(`/assignment-actions/${id}`);
    return res.data;
  },

  /* ── Validate ── */
  async validate(id: number): Promise<ValidateResult> {
    const res = await api.post(`/assignment-actions/${id}/validate`);
    return res.data;
  },

  /* ── Approve ── */
  async approve(id: number): Promise<ApproveResult> {
    const res = await api.post(`/assignment-actions/${id}/approve`);
    return res.data;
  },

  /* ── Execute ── */
  async execute(id: number): Promise<ExecuteResult> {
    const res = await api.post(`/assignment-actions/${id}/execute`);
    return res.data;
  },

  /* ── Cancel ── */
  async cancel(id: number): Promise<CancelResult> {
    const res = await api.post(`/assignment-actions/${id}/cancel`);
    return res.data;
  },

  /* ── Audit log for an action ── */
  async getAuditLog(id: number): Promise<ActionWithAudit> {
    const res = await api.get(`/assignment-actions/${id}/audit`);
    return res.data;
  },

  /* ── Global audit log ── */
  async getGlobalAuditLog(params?: {
    activityNumber?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogResult> {
    const res = await api.get('/assignment-actions/audit', { params });
    return res.data;
  },

  /* ── Reconcile ── */
  async reconcile(): Promise<ReconcileResult> {
    const res = await api.post('/assignment-actions/reconcile');
    return res.data;
  },
};
