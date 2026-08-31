/* ------------------------------------------------ */
/* ODIN ENGINE – API CLIENT                         */
/* ------------------------------------------------ */

import { api } from "./api";

/* ── Crawler Status ────────────────────────────── */

export interface CrawlerStatus {
  stale: boolean;
  lastRunAt: string | null;
  minutesAgo: number | null;
  thresholdMinutes: number;
  recentRuns: CrawlerRun[];
}

export interface CrawlerRun {
  id: number;
  snapshot_at: string;
  total_active: number;
  new_count: number;
  gone_count: number;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export async function fetchCrawlerStatus(): Promise<CrawlerStatus> {
  const res = await api.get("/engine/crawler-status");
  return res.data;
}

/* ── Engine Config ─────────────────────────────── */

export interface EngineConfig {
  engine_mode: string;
  stale_threshold_minutes: number;
  max_tickets_per_person_sh: number;
  similar_remaining_hours_threshold: number;
  enabled: boolean;
}

export async function fetchEngineConfig(): Promise<EngineConfig> {
  const res = await api.get("/engine/config");
  return res.data;
}

export async function updateEngineConfig(updates: Partial<EngineConfig>): Promise<EngineConfig> {
  const res = await api.put("/engine/config", updates);
  return res.data.config;
}

/* ── Engine Runs ───────────────────────────────── */

export interface AssignmentRun {
  id: number;
  mode: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  trigger_type: string;
  crawler_snapshot_at: string | null;
  total_tickets: number;
  assigned_count: number;
  skipped_count: number;
  error_count: number;
  error_message: string | null;
  created_by: string | null;
}

export async function fetchEngineRuns(limit = 50): Promise<AssignmentRun[]> {
  const res = await api.get("/engine/runs", { params: { limit } });
  return res.data;
}

export async function triggerEngineRun(): Promise<{ ok: boolean; runId: number; summary: any }> {
  const res = await api.post("/engine/run");
  return res.data;
}

/* ── Engine Decisions ──────────────────────────── */

export interface AssignmentDecision {
  id: number;
  run_id: number;
  ticket_external_id: string;
  queue_type: string;
  system_name: string | null;
  priority_score: number;
  priority_reason: string;
  assigned_to: string | null;
  decision_type: string;
  candidates_evaluated: any[];
  exclusion_reasons: any[];
  deciding_rule: string | null;
  explanation: string | null;
  created_at: string;
}

export async function fetchRunDecisions(runId: number): Promise<AssignmentDecision[]> {
  const res = await api.get(`/engine/runs/${runId}/decisions`);
  return res.data;
}

export async function explainTicket(ticketExternalId: string): Promise<AssignmentDecision[]> {
  const res = await api.get(`/engine/explain/${encodeURIComponent(ticketExternalId)}`);
  return res.data;
}

/* ── Manual Exclusions ─────────────────────────── */

export interface ManualExclusion {
  id: number;
  system_name: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export async function fetchExclusions(): Promise<ManualExclusion[]> {
  const res = await api.get("/engine/exclusions");
  return res.data;
}

export async function addExclusion(system_name: string, reason?: string): Promise<ManualExclusion> {
  const res = await api.post("/engine/exclusions", { system_name, reason });
  return res.data.exclusion;
}

export async function deleteExclusion(id: number): Promise<void> {
  await api.delete(`/engine/exclusions/${id}`);
}

/* ── Subtype Exclusions ────────────────────────── */

export interface SubtypeExclusion {
  id: number;
  subtype: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export async function fetchSubtypeExclusions(): Promise<SubtypeExclusion[]> {
  const res = await api.get("/engine/exclusions/subtypes");
  return res.data;
}

export async function fetchAvailableSubtypes(): Promise<string[]> {
  const res = await api.get("/engine/exclusions/subtypes/available");
  return res.data;
}

export async function addSubtypeExclusion(subtype: string, reason?: string): Promise<SubtypeExclusion> {
  const res = await api.post("/engine/exclusions/subtypes", { subtype, reason });
  return res.data.exclusion;
}

export async function deleteSubtypeExclusion(id: number): Promise<void> {
  await api.delete(`/engine/exclusions/subtypes/${id}`);
}

/* ── Employee Shift Roles ──────────────────────── */

export interface EmployeeShiftRole {
  id: number;
  employee_name: string;
  date: string;
  shift_code: string;
  role_code: string;
  comment: string | null;
  created_by: string | null;
  created_at: string;
}

export async function fetchRolesForDate(date: string): Promise<EmployeeShiftRole[]> {
  const res = await api.get("/engine/roles", { params: { date } });
  return res.data;
}

export async function setRole(data: {
  employee_name: string;
  date: string;
  shift_code: string;
  role_code: string;
  comment?: string;
}): Promise<EmployeeShiftRole> {
  const res = await api.post("/engine/roles", data);
  return res.data.role;
}

export async function deleteRole(id: number): Promise<void> {
  await api.delete(`/engine/roles/${id}`);
}

export async function bulkSetRoles(data: {
  employee_name: string;
  dates: string[];
  shift_code: string;
  role_code: string;
  comment?: string;
}): Promise<EmployeeShiftRole[]> {
  const res = await api.post("/engine/roles/bulk", data);
  return res.data.roles;
}
