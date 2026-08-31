/* ------------------------------------------------ */
/* SHIFTPLAN – API FUNCTIONS (AUTH)                 */
/* ------------------------------------------------ */

import { api, asArray, asObject } from "../../api/api";

export interface ManualShiftplanEmployee {
  employee_name: string;
  created_at?: string | null;
  created_by?: string | null;
}

/* ------------------------------------------------ */
/* GET MONTHS                                       */
/* ------------------------------------------------ */

export async function fetchMonths(): Promise<string[]> {
  const res = await api.get("/schedules");
  const data = asObject(res.data, "fetchMonths");
  return asArray(data?.months, "fetchMonths:months");
}

/* ------------------------------------------------ */
/* GET SCHEDULE BY MONTH                            */
/* ------------------------------------------------ */

export async function fetchSchedule(month: string) {
  try {
    const res = await api.get(`/schedules/${encodeURIComponent(month)}`);
    return asObject(res.data, "fetchSchedule");
  } catch (primaryError) {
    // The embedded ODIN GO views use a narrow, read-only fallback endpoint.
    // This keeps week/day planning available while Jarvis identity refreshes.
    try {
      const fallback = await api.get(`/odin-go/schedule/${encodeURIComponent(month)}`);
      return asObject(fallback.data, "fetchSchedule:fallback");
    } catch {
      throw primaryError;
    }
  }
}

/* ------------------------------------------------ */
/* IMPORT SCHEDULE (ADMIN/SUPERADMIN)               */
/* ------------------------------------------------ */

export async function importSchedule(
  month: string,
  data: any,
  options?: { preserveManualEmployees?: boolean },
) {
  const res = await api.post("/schedules/import", {
    month,
    data,
    preserveManualEmployees: options?.preserveManualEmployees !== false,
  });
  return res.data;
}

export async function createManualShiftplanEmployee(month: string, employeeName: string) {
  const res = await api.post(`/schedules/${encodeURIComponent(month)}/manual-employees`, {
    employeeName,
  });
  return asObject(res.data, "createManualShiftplanEmployee");
}

export async function deleteManualShiftplanEmployee(month: string, employeeName: string) {
  const res = await api.delete(
    `/schedules/${encodeURIComponent(month)}/manual-employees/${encodeURIComponent(employeeName)}`,
  );
  return asObject(res.data, "deleteManualShiftplanEmployee");
}
