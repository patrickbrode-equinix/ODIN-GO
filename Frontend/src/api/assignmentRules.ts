/* ------------------------------------------------ */
/* Assignment Rules API Client                      */
/* ------------------------------------------------ */

import { api } from "./api";

export interface AssignmentRule {
  id: number;
  rule_key: string;
  category: "priority" | "role" | "load" | "exception";
  label: string;
  description: string | null;
  config_json: Record<string, unknown>;
  enabled: boolean;
  sort_order: number;
  version: number;
  updated_by: string | null;
  updated_at: string;
}

export interface AssignmentRuleHistory {
  id: number;
  rule_id: number;
  rule_key: string;
  config_json: Record<string, unknown>;
  version: number;
  changed_by: string | null;
  change_note: string | null;
  created_at: string;
}

export async function fetchAssignmentRules(): Promise<AssignmentRule[]> {
  const { data } = await api.get("/assignment-rules");
  return data;
}

export async function fetchAssignmentRule(ruleKey: string): Promise<{ rule: AssignmentRule; history: AssignmentRuleHistory[] }> {
  const { data } = await api.get(`/assignment-rules/${ruleKey}`);
  return data;
}

export async function updateAssignmentRule(ruleKey: string, update: { config_json?: Record<string, unknown>; enabled?: boolean; sort_order?: number; change_note?: string }): Promise<AssignmentRule> {
  const { data } = await api.put(`/assignment-rules/${ruleKey}`, update);
  return data;
}

export async function toggleAssignmentRule(ruleKey: string): Promise<AssignmentRule> {
  const { data } = await api.patch(`/assignment-rules/${ruleKey}/toggle`);
  return data;
}

export async function rollbackAssignmentRule(ruleKey: string, version: number): Promise<AssignmentRule> {
  const { data } = await api.post(`/assignment-rules/${ruleKey}/rollback/${version}`);
  return data;
}
