import { api } from "./api";

export interface AttendanceRecord {
  id: number;
  employee_name: string;
  date: string; // YYYY-MM-DD
  arrival_time: string | null; // HH:MM
  departure_time: string | null; // HH:MM
  note: string | null;
  created_by: string | null;
  updated_at: string;
}

export async function fetchAttendance(from: string, to: string): Promise<AttendanceRecord[]> {
  const res = await api.get<AttendanceRecord[]>("/attendance", { params: { from, to } });
  return res.data;
}

export async function upsertAttendance(data: {
  employee_name: string;
  date: string;
  arrival_time?: string | null;
  departure_time?: string | null;
  note?: string | null;
}): Promise<AttendanceRecord> {
  const res = await api.put<AttendanceRecord>("/attendance", data);
  return res.data;
}

export async function deleteAttendance(id: number): Promise<void> {
  await api.delete(`/attendance/${id}`);
}
