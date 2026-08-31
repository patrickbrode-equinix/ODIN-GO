import { api } from "./api";

export type ShiftHoursMonth = {
  month: number;
  key: string;
  actual_hours: number;
  target_hours: number;
  diff_hours: number;
};

export type ShiftHoursEmployee = {
  employee_name: string;
  actual_hours: number;
  annual_target_hours: number;
  monthly_target_hours: number;
  annual_diff_hours: number;
  completion_rate: number;
  months: ShiftHoursMonth[];
};

export type ShiftHoursResponse = {
  year: number;
  monthly_target_hours: number;
  annual_target_hours: number;
  team_actual_hours: number;
  team_annual_target_hours: number;
  employees_on_target: number;
  employees_below_target: number;
  employees: ShiftHoursEmployee[];
};

export async function fetchShiftHours(year: number) {
  const response = await api.get<ShiftHoursResponse>("/stats/shift-hours", { params: { year } });
  return response.data;
}