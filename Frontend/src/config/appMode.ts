export type AppMode = "odin" | "shiftplanner";

export const APP_MODE: AppMode =
  import.meta.env.VITE_APP_MODE === "odin" ? "odin" : "shiftplanner";

export const IS_SHIFTPLANNER_MODE = APP_MODE === "shiftplanner";

const SHIFTPLANNER_PAGE_KEYS = new Set([
  "shiftplan",
  "shiftplan_drafts",
  "wellbeing",
  "shiftplan_control",
  "teams_center",
  "tv_dashboard",
  "admin_settings",
  "settings",
  "user_management",
  "protokoll",
]);

const SHIFTPLANNER_ADMIN_TABS = new Set([
  "shiftplan",
  "audit",
]);

export function isPageEnabledInCurrentMode(pageKey: string): boolean {
  if (!IS_SHIFTPLANNER_MODE) return true;
  return SHIFTPLANNER_PAGE_KEYS.has(pageKey);
}

export function isAdminTabEnabledInCurrentMode(tabId: string): boolean {
  if (!IS_SHIFTPLANNER_MODE) return true;
  return SHIFTPLANNER_ADMIN_TABS.has(tabId);
}

export function getDefaultRouteForCurrentMode(): string {
  return IS_SHIFTPLANNER_MODE ? "/shiftplan" : "/dashboard";
}
