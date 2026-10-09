import { api } from "./api";

export type SuggestionShiftType = "night" | "late" | "early";

export type SuggestionWellbeing = {
  level: "ok" | "elevated" | "high";
  note: string | null;
};

export type UnderstaffingCandidate = {
  employee: string;
  fromShiftCode: string | null;
  wellbeing: SuggestionWellbeing;
  reasons: string[];
};

export type UnderstaffingSuggestionItem = {
  date: string; // YYYY-MM-DD
  day: number;
  shiftType: SuggestionShiftType;
  max: number;
  min: number;
  actual: number;
  missing: number;
  severity: "warning" | "critical";
  candidates: UnderstaffingCandidate[];
};

export type UnderstaffingSuggestionsResponse = {
  ok: boolean;
  items: UnderstaffingSuggestionItem[];
};

export type ShiftConfigStaffingRule = {
  shift_type: string;
  min_count: number;
  max_count: number | null;
};

/** GET /shiftplan-control/understaffing-suggestions?year=&month= (month is 1-12). */
export async function fetchUnderstaffingSuggestions(
  year: number,
  month: number,
  signal?: AbortSignal,
): Promise<UnderstaffingSuggestionItem[]> {
  const response = await api.get<UnderstaffingSuggestionsResponse>("/shiftplan-control/understaffing-suggestions", {
    params: { year, month },
    signal,
  });
  const items = response.data?.items;
  return Array.isArray(items) ? items : [];
}

/** GET /shift-config/staffing-rules (any authenticated user). */
export async function fetchShiftConfigStaffingRules(): Promise<ShiftConfigStaffingRule[]> {
  const response = await api.get<{ ok: boolean; rules?: ShiftConfigStaffingRule[] }>("/shift-config/staffing-rules");
  return Array.isArray(response.data?.rules) ? response.data.rules : [];
}

export interface ShiftConfigStaffingDayLimit {
  day_context: "saturday" | "sunday" | "holiday";
  shift_type: "early" | "late";
  min_count: number;
  max_count: number | null;
}

/** GET /shift-config/staffing-rules incl. the Saturday / Sunday / holiday limits. */
export async function fetchShiftConfigStaffingLimits(): Promise<{
  rules: ShiftConfigStaffingRule[];
  dayLimits: ShiftConfigStaffingDayLimit[];
}> {
  const response = await api.get<{ ok: boolean; rules?: ShiftConfigStaffingRule[]; day_limits?: ShiftConfigStaffingDayLimit[] }>("/shift-config/staffing-rules");
  return {
    rules: Array.isArray(response.data?.rules) ? response.data.rules : [],
    dayLimits: Array.isArray(response.data?.day_limits) ? response.data.day_limits : [],
  };
}
