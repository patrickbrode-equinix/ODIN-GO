import type { CSSProperties } from "react";

export type ShiftColorKind = "early" | "late" | "night" | "absent" | "neutral";

const SHIFT_STYLES: Record<ShiftColorKind, CSSProperties> = {
  early: { backgroundColor: "#c2410c", borderColor: "#fb923c", color: "#fff7ed" },
  late: { backgroundColor: "#a16207", borderColor: "#facc15", color: "#fefce8" },
  night: { backgroundColor: "#1d4ed8", borderColor: "#60a5fa", color: "#eff6ff" },
  absent: { backgroundColor: "#374151", borderColor: "#6b7280", color: "#f3f4f6" },
  neutral: { backgroundColor: "#111827", borderColor: "#475569", color: "#cbd5e1" },
};

export function getShiftColorKind(code: string): ShiftColorKind {
  const value = String(code || "").trim().toUpperCase();
  if (["FS", "ABW", "S", "SEMINAR", "OFF", "K", "U", "URLAUB", "KRANK", "VACATION", "SICK", "TRAINING"].includes(value)) return "absent";
  if (/^(E|HE)/.test(value)) return "early";
  if (/^(L|HL)/.test(value)) return "late";
  if (/^N/.test(value)) return "night";
  return "neutral";
}

export function getShiftColorStyle(code: string): CSSProperties {
  return SHIFT_STYLES[getShiftColorKind(code)];
}

export const SHIFT_COLOR_LEGEND = [
  { label: "Frühschicht", code: "E", kind: "early" as const },
  { label: "Spätschicht", code: "L", kind: "late" as const },
  { label: "Nachtschicht", code: "N", kind: "night" as const },
  { label: "Abwesend", code: "ABW", kind: "absent" as const },
];

export function getShiftKindStyle(kind: ShiftColorKind): CSSProperties {
  return SHIFT_STYLES[kind];
}
