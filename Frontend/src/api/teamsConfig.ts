/* ------------------------------------------------ */
/* Teams Config API Client                          */
/* ------------------------------------------------ */

import { api } from "./api";

/* ---- Types ---- */

export interface TeamsStatus {
  webhook_configured: boolean;
  webhook_active?: boolean;
  bot_configured: boolean;
  graph_configured: boolean;
  sent_today: number;
  failed_today: number;
  last_success: { sent_at: string; message_type: string; recipient: string } | null;
  last_error: { sent_at: string; error_msg: string; message_type: string } | null;
  pending_retries: number;
  mapped_employees: number;
}

export interface TeamsEventConfig {
  id: number;
  event_key: string;
  label: string;
  enabled: boolean;
  priority: number;
  send_mode: "immediate" | "digest";
  respect_quiet_hours: boolean;
  cooldown_minutes: number;
  deduplicate: boolean;
  escalation: boolean;
  updated_at: string;
}

export interface TeamsRoutingRule {
  id: number;
  event_key: string;
  event_label?: string;
  target_type: "person" | "group" | "role" | "shift";
  target_value: string;
  enabled: boolean;
  sort_order: number;
}

export interface TeamsTemplate {
  id: number;
  template_key: string;
  title: string;
  body_text: string;
  compact_body: string | null;
  include_deep_link: boolean;
  include_ticket_details: boolean;
  include_remaining_time: boolean;
  include_priority_badge: boolean;
  updated_at: string;
}

export interface TeamsMessageLog {
  id: number;
  message_type: string;
  recipient: string | null;
  channel: string | null;
  content: string;
  status: "sent" | "failed";
  error_msg: string | null;
  sent_at: string;
}

export interface TeamsEmployee {
  employee_name: string;
  email: string | null;
  email_source?: string | null;
  is_active?: boolean;
  manual_override: boolean;
  updated_at: string;
  user_id: number | null;
}

export interface TeamsDiagnosticCheck {
  key: string;
  title: string;
  status: "ok" | "warning" | "failed";
  category: string;
  action: string;
  detail: string;
  next_step: string | null;
  data: Record<string, unknown> | null;
}

export interface TeamsDiagnostics {
  generated_at: string;
  ready: boolean;
  summary: string;
  blocking_issues: string[];
  capabilities: {
    channel_notifications: boolean;
    graph_lookup: boolean;
    personal_notifications: boolean;
  };
  checks: TeamsDiagnosticCheck[];
}

/* ---- API Functions ---- */

export async function fetchTeamsStatus(): Promise<TeamsStatus> {
  const { data } = await api.get("/teams-config/status");
  return data;
}

export async function fetchTeamsDiagnostics(): Promise<TeamsDiagnostics> {
  const { data } = await api.get("/teams-config/diagnostics");
  return data;
}

export async function fetchTeamsEvents(): Promise<TeamsEventConfig[]> {
  const { data } = await api.get("/teams-config/events");
  return data;
}

export async function updateTeamsEvent(eventKey: string, update: Partial<TeamsEventConfig>): Promise<TeamsEventConfig> {
  const { data } = await api.put(`/teams-config/events/${eventKey}`, update);
  return data;
}

export async function fetchTeamsRouting(): Promise<TeamsRoutingRule[]> {
  const { data } = await api.get("/teams-config/routing");
  return data;
}

export async function createTeamsRoutingRule(rule: Partial<TeamsRoutingRule>): Promise<TeamsRoutingRule> {
  const { data } = await api.post("/teams-config/routing", rule);
  return data;
}

export async function updateTeamsRoutingRule(id: number, rule: Partial<TeamsRoutingRule>): Promise<TeamsRoutingRule> {
  const { data } = await api.put(`/teams-config/routing/${id}`, rule);
  return data;
}

export async function deleteTeamsRoutingRule(id: number): Promise<void> {
  await api.delete(`/teams-config/routing/${id}`);
}

export async function fetchTeamsTemplates(): Promise<TeamsTemplate[]> {
  const { data } = await api.get("/teams-config/templates");
  return data;
}

export async function updateTeamsTemplate(key: string, update: Partial<TeamsTemplate>): Promise<TeamsTemplate> {
  const { data } = await api.put(`/teams-config/templates/${key}`, update);
  return data;
}

export async function previewTemplate(body_text: string, sample_data?: Record<string, string>): Promise<{ rendered: string; placeholders: string[] }> {
  const { data } = await api.post("/teams-config/templates/preview", { body_text, sample_data });
  return data;
}

export async function fetchTeamsSettings(): Promise<Record<string, string>> {
  const { data } = await api.get("/teams-config/settings");
  return data;
}

export async function updateTeamsSettings(settings: Record<string, string>): Promise<Record<string, string>> {
  const { data } = await api.put("/teams-config/settings", settings);
  return data;
}

export async function testPowerAutomateWebhook(webhookUrl: string): Promise<{
  success: boolean;
  active: boolean;
  status: "active" | "failed";
  httpStatus?: number | null;
  lastTestAt?: string;
  message: string;
}> {
  const { data } = await api.post("/teams-config/webhook/test", { webhookUrl });
  return data;
}

export async function fetchTeamsLog(params?: { limit?: number; offset?: number; status?: string; recipient?: string; message_type?: string }): Promise<{ rows: TeamsMessageLog[]; total: number }> {
  const { data } = await api.get("/teams-config/log", { params });
  return data;
}

export async function fetchTeamsErrors(params?: { limit?: number; offset?: number }): Promise<TeamsMessageLog[]> {
  const { data } = await api.get("/teams-config/errors", { params });
  return data;
}

export async function retryTeamsMessage(id: number): Promise<{ success: boolean }> {
  const { data } = await api.post(`/teams-config/retry/${id}`);
  return data;
}

export async function sendTeamsTestMessage(opts: { channel?: string; title?: string; body?: string }): Promise<{ success: boolean }> {
  const { data } = await api.post("/teams-config/test/send", opts);
  return data;
}

export async function sendTeamsAssignmentTestMessage(opts: {
  recipientName: string;
  recipientUpn: string;
  ticketNumber: string;
  location?: string;
  priority?: string;
}): Promise<{ success: boolean; eventId?: string; httpStatus?: number | null; message: string }> {
  const { data } = await api.post("/teams-config/assignment/test", opts);
  return data;
}

export async function testTeamsTemplate(templateKey: string, channel?: string): Promise<{ success: boolean; rendered: string }> {
  const { data } = await api.post("/teams-config/test/template", { template_key: templateKey, channel });
  return data;
}

export async function fetchTeamsEmployees(): Promise<TeamsEmployee[]> {
  const { data } = await api.get("/teams-config/employees");
  return data;
}
