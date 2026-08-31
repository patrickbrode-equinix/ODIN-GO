/* ———————————————————————————————— */
/* NAVIGATION CONFIG (STRUCTURE ONLY)               */
/* RBAC happens in AuthContext / PageGuard          */
/* ———————————————————————————————— */

import type { LucideIcon } from "lucide-react";
import type { TranslationKey } from "../context/LanguageContext";
import {
  LayoutDashboard,
  Calendar,
  CalendarClock,
  FileText,
  Settings,
  SlidersHorizontal,
  Tv,
  Users as UsersIcon,
  Ticket,
  Brain,
  MessageSquare,
  Shield,
  BarChart3,
  ClipboardList,
  HeartPulse,
} from "lucide-react";
import { isPageEnabledInCurrentMode } from "./appMode";

/* ———————————————————————————————— */
/* TYPES                                            */
/* ———————————————————————————————— */

export type NavSection = "top" | "bottom";

export type NavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  section: NavSection;
  pageKey: string;
};

/* ———————————————————————————————— */
/* GROUP HELPERS                                    */
/* ———————————————————————————————— */

export function normalizeGroup(value?: string | null): string {
  return String(value || "other")
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function groupLabel(group: string): string {
  if (group === "c-ops") return "C-OPS Team";
  if (group === "f-ops") return "F-OPS Team";
  return "Other Team";
}

/* ———————————————————————————————— */
/* NAV ITEMS                                        */
/* ———————————————————————————————— */

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", section: "top", pageKey: "dashboard" },
  { to: "/shiftplan", icon: Calendar, label: "Schichtplan", section: "top", pageKey: "shiftplan" },
  { to: "/drafts", icon: ClipboardList, label: "Drafts", section: "top", pageKey: "shiftplan_drafts" },
  { to: "/wellbeing", icon: HeartPulse, label: "Wellbeing", section: "top", pageKey: "wellbeing" },
  { to: "/handover", icon: FileText, label: "Handover", section: "top", pageKey: "handover" },
  { to: "/tickets", icon: Ticket, label: "Tickets", section: "top", pageKey: "tickets" },
  { to: "/odin-logic", icon: Brain, label: "ODIN-Logik", section: "top", pageKey: "odin_logic" },

  { to: "/tv-dashboard", icon: Tv, label: "TV Dashboard", section: "top", pageKey: "tv_dashboard" },

  { to: "/shiftplan-control", icon: CalendarClock, label: "Schichtplaner", section: "top", pageKey: "shiftplan_control" },
  { to: "/teams-center", icon: MessageSquare, label: "Teams Center", section: "top", pageKey: "teams_center" },
  { to: "/admin-settings", icon: Shield, label: "Admin Settings", section: "top", pageKey: "admin_settings" },
  { to: "/dashboard/statistiken", icon: BarChart3, label: "Statistik", section: "top", pageKey: "dashboard" },
  { to: "/users", icon: UsersIcon, label: "User Management", section: "top", pageKey: "user_management" },
  // Settings hidden from sidebar (still accessible via /settings directly)
];

export const NAV_TOP = NAV_ITEMS.filter((i) => i.section === "top" && isPageEnabledInCurrentMode(i.pageKey));
export const NAV_BOTTOM = NAV_ITEMS.filter((i) => i.section === "bottom" && isPageEnabledInCurrentMode(i.pageKey));

/* ———————————————————————————————— */
/* PAGE DEFINITIONS (Policy UI)                     */
/* ———————————————————————————————— */

const ALL_PAGE_DEFS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "shiftplan", label: "Shiftplan" },
  { key: "shiftplan_drafts", label: "Drafts" },
  { key: "wellbeing", label: "Wellbeing" },
  { key: "handover", label: "Handover" },
  { key: "tickets", label: "Tickets" },

  { key: "tv_dashboard", label: "TV Dashboard" },
  { key: "protokoll", label: "Protokoll" },
  { key: "commit_compliance", label: "Commit Compliance" },
  { key: "settings", label: "Settings" },
  { key: "odin_logic", label: "ODIN-Logik" },
  { key: "shiftplan_control", label: "Schichtplaner" },
  { key: "teams_center", label: "Teams Center" },
  { key: "admin_settings", label: "Admin Settings" },
  { key: "user_management", label: "User Management" },
  { key: "ticket_audit", label: "Ticket-Audit" },
] as const;

export const PAGE_DEFS = ALL_PAGE_DEFS.filter((page) => isPageEnabledInCurrentMode(page.key)) as unknown as typeof ALL_PAGE_DEFS;

export type PageKey = (typeof ALL_PAGE_DEFS)[number]["key"];

const PAGE_LABEL_KEYS: Record<PageKey, TranslationKey> = {
  dashboard: "nav.dashboard",
  shiftplan: "nav.shiftplan",
  shiftplan_drafts: "nav.shiftplan",
  wellbeing: "nav.shiftplan",
  handover: "nav.handover",
  tickets: "nav.tickets",
  tv_dashboard: "nav.tvDashboard",
  protokoll: "nav.protokoll",
  commit_compliance: "nav.commitCompliance",
  settings: "common.settings",
  odin_logic: "nav.odinLogic",
  shiftplan_control: "nav.shiftplanControl",
  teams_center: "nav.teamsCenter",
  admin_settings: "nav.adminSettings",
  user_management: "nav.userManagement",
  ticket_audit: "nav.ticketAudit",
};

export function translatePageLabel(pageKey: PageKey, t: (key: TranslationKey) => string): string {
  return t(PAGE_LABEL_KEYS[pageKey]);
}
