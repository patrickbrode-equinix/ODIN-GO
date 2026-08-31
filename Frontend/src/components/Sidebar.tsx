/* ———————————————————————————————— */
/* SIDEBAR – FINAL (ACCESS LEVEL BASED)             */
/* ———————————————————————————————— */

import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { logActivityEventSafe } from "../api/activity";
import { useAuth } from "../context/AuthContext";
import { useLanguage, type TranslationKey } from "../context/LanguageContext";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { useHandoverStore } from "../store/handoverStore";
import { AppTutorialDialog } from "./AppTutorialDialog";

/* Icon glow class – consistent subtle glow on all nav icons */
const ICON_GLOW = "drop-shadow-[0_0_8px_rgba(0,229,255,0.4)] transition-all duration-300";
const ICON_ACTIVE_GLOW = "drop-shadow-[0_0_18px_rgba(0,229,255,0.95)] transition-all duration-300";

/* ── NAV ITEM DESCRIPTIONS – makes every link self-explanatory ── */
const NAV_DESCRIPTIONS: Record<string, Record<string, string>> = {
  dashboard: { de: "Live-Überblick aller Operationen", en: "Live overview of all operations" },
  shiftplan: { de: "Schichtplan anzeigen & bearbeiten", en: "View & edit shift schedule" },
  handover: { de: "Schichtübergabe-Protokolle", en: "Shift handover protocols" },
  tickets: { de: "Aktive Tickets & Queue-Status", en: "Active tickets & queue status" },
  odin_logic: { de: "Automatische Zuweisung steuern", en: "Control automatic assignment" },
  tv_dashboard: { de: "TV-Modus für den Teambildschirm", en: "TV mode for team display" },
  commit_compliance: { de: "Crawler-Daten & SLA-Einhaltung", en: "Crawler data & SLA compliance" },
  shiftplan_control: { de: "Monatliche Dienstplanerstellung", en: "Monthly shift plan creation" },
  teams_center: { de: "Teams-Benachrichtigungen verwalten", en: "Manage Teams notifications" },
  admin_settings: { de: "System- & Engine-Konfiguration", en: "System & engine configuration" },
  user_management: { de: "Benutzer & Zugriffsrechte", en: "Users & access permissions" },
  statistik: { de: "Auswertungen & KPI-Berichte", en: "Reports & KPI analytics" },
};


/* NAV CONFIG */
import {
  NAV_TOP,
  NAV_BOTTOM,
  groupLabel,
  normalizeGroup,
} from "../config/navigation";

/* ———————————————————————————————— */
/* COMPONENT                                        */
/* ———————————————————————————————— */

interface SidebarProps {
  isCollapsed: boolean;
}

const NAV_TRANSLATION_KEYS: Partial<Record<string, TranslationKey>> = {
  dashboard: "nav.dashboard",
  shiftplan: "nav.shiftplan",
  handover: "nav.handover",
  tickets: "nav.tickets",
  tv_dashboard: "nav.tvDashboard",
  protokoll: "nav.protokoll",
  commit_compliance: "nav.commitCompliance",
  odin_logic: "nav.odinLogic",
  shiftplan_control: "nav.shiftplanControl",
  teams_center: "nav.teamsCenter",
  admin_settings: "nav.adminSettings",
  user_management: "nav.userManagement",
  ticket_audit: "nav.ticketAudit",
};

export function Sidebar({ isCollapsed }: SidebarProps) {
  const { user, canAccess } = useAuth();
  const { t, language } = useLanguage();
  const location = useLocation();
  const [shiftplanOpen, setShiftplanOpen] = useState(true);
  const [dashOpen, setDashOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const openHandovers = useHandoverStore((state) => state.handovers.filter((handover) => handover.status !== "Erledigt").length);

  if (!user) return null;

  const group = normalizeGroup(user.group);
  const teamLabel = groupLabel(group);
  const shiftplanChildPaths = new Set(["/shiftplan-control"]);
  const canAccessAdminHub =
    canAccess("admin_settings", "view")
    || canAccess("teams_center", "view")
    || canAccess("shiftplan_control", "view")
    || canAccess("odin_logic", "view")
    || canAccess("protokoll", "view");

  /* ———————————————————————————————— */
  /* FILTERED NAV (FINAL)               */
  /* ———————————————————————————————— */

  const topItems = NAV_TOP.filter((item) => {
    // TV Dashboard is reserved for the master account (root)
    if (item.pageKey === "tv_dashboard" && !user?.isRoot) return false;
    return (item.pageKey === "admin_settings" ? canAccessAdminHub : canAccess(item.pageKey, "view")) && !shiftplanChildPaths.has(item.to);
  });

  const shiftplanChildItems = NAV_TOP.filter((item) =>
    shiftplanChildPaths.has(item.to) && canAccess(item.pageKey, "view")
  );

  const bottomItems = NAV_BOTTOM.filter((item) =>
    canAccess(item.pageKey, "view")
  );

  const isoWeek = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return weekNo;
  };
  const currentKW = isoWeek(new Date());
  const isShiftplanActive = location.pathname.startsWith("/shiftplan")
    || shiftplanChildItems.some((item) => location.pathname.startsWith(item.to));
  const isDashActive = location.pathname.startsWith("/dashboard");
  const labelForItem = (pageKey: string, fallback: string) => {
    const translationKey = NAV_TRANSLATION_KEYS[pageKey];
    return translationKey ? t(translationKey) : fallback;
  };
  const logSidebarEvent = (action: string, details: Record<string, unknown>) => {
    logActivityEventSafe({
      action,
      module: "NAVIGATION",
      details: {
        source: "sidebar",
        currentPath: location.pathname,
        collapsed: isCollapsed,
        ...details,
      },
    });
  };


  return (
    <aside
      className={`odin-stage-frame relative flex flex-col border-r border-cyan-400/16 backdrop-blur-2xl shadow-[0_0_56px_rgba(0,180,255,0.12)] transition-all duration-300 ${isCollapsed ? "w-20" : "w-72"}`}
      style={{ background: "linear-gradient(180deg, rgba(4,10,26,0.98) 0%, rgba(6,14,34,0.95) 40%, rgba(3,8,20,0.99) 100%)", boxShadow: "inset -1px 0 0 rgba(0,180,255,0.14), 0 0 56px rgba(0,180,255,0.10)" }}
    >
      {/* Ambient gradient mesh */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-20 -left-10 w-72 h-72 rounded-full blur-[72px] opacity-40" style={{ background: "radial-gradient(circle, rgba(0,229,255,0.14), transparent 70%)", animation: "ambientFloat1 20s ease-in-out infinite", willChange: "transform" }} />
        <div className="absolute -bottom-20 -right-10 w-56 h-56 rounded-full blur-[60px] opacity-30" style={{ background: "radial-gradient(circle, rgba(79,70,229,0.12), transparent 70%)", animation: "ambientFloat2 24s ease-in-out infinite", willChange: "transform" }} />
        <div className="absolute top-1/2 -left-5 w-40 h-40 rounded-full blur-[48px] opacity-22" style={{ background: "radial-gradient(circle, rgba(16,185,129,0.08), transparent 70%)", animation: "ambientFloat3 28s ease-in-out infinite", willChange: "transform" }} />
      </div>
      {/* Neon right edge glow */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-cyan-400/35 to-transparent" />
      {/* Inner left glow trace */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-linear-to-b from-transparent via-blue-500/22 to-transparent" />
      <AppTutorialDialog open={tutorialOpen} onOpenChange={setTutorialOpen} />

      {/* HEADER */}
      <div
        className={`relative w-full flex items-center transition-all ${isCollapsed ? "justify-center h-20 border-b border-cyan-400/10" : "px-3 h-36 border-b border-cyan-400/12"}`}
        style={{ background: "linear-gradient(180deg,rgba(0,229,255,0.06),transparent 70%)" }}
      >
        {/* Header neon edge */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px" style={{ background: "linear-gradient(90deg, transparent 5%, rgba(0,229,255,0.35) 30%, rgba(0,180,255,0.50) 50%, rgba(0,229,255,0.35) 70%, transparent 95%)" }} />
        {!isCollapsed ? (
          <div className="flex flex-col justify-center w-full px-1 py-2 overflow-hidden gap-1.5">
            <div className="flex items-center gap-3 w-full pl-1">
              <img
                src="/odin-assets/sidebar-logo.png"
                alt="ODIN Logo"
                className="w-13 h-13 md:w-15 md:h-15 object-contain shrink-0 drop-shadow-[0_0_22px_rgba(0,229,255,0.85)]"
              />
              <div className="flex flex-col justify-center min-w-0 flex-1">
                <span className="font-display-brand text-[28px] font-black tracking-[0.24em] text-transparent bg-clip-text bg-gradient-to-r from-[#00E5FF] via-[#00B4FF] to-[#00E5FF] drop-shadow-[0_0_24px_rgba(0,229,255,0.95)] leading-none">
                  O.D.I.N
                </span>
              </div>
            </div>
            <div className="odin-display-kicker text-[9px] md:text-[10px] leading-snug text-[#00E5FF]/75 drop-shadow-[0_0_10px_rgba(0,229,255,0.6)] text-left pl-1 whitespace-normal">
              {t("nav.operationsNode")}
            </div>
          </div>
        ) : (
          <img
            src="/odin-assets/sidebar-logo.png"
            alt="ODIN Logo"
            className="w-12 h-12 object-contain drop-shadow-[0_0_12px_rgba(0,216,255,0.6)] mt-2"
          />
        )}
      </div>

      {/* NAV – TOP */}
      <nav className="flex-1 p-4 space-y-2">
        {topItems.map((item) => {
          // Special: expandable Dashboard
          if (item.to === "/dashboard") {
            const baseClass = ({ isActive }: { isActive: boolean }) =>
              `relative flex items-center rounded-xl transition-all duration-200 ${isActive || isDashActive
                ? "bg-cyan-500/18 border border-cyan-400/38 shadow-[0_0_32px_rgba(0,229,255,0.38),inset_0_0_16px_rgba(0,229,255,0.08)] text-cyan-100"
                : "bg-transparent border border-transparent text-slate-400/70 hover:bg-cyan-500/12 hover:border-cyan-400/26 hover:shadow-[0_0_24px_rgba(0,229,255,0.22)] hover:text-cyan-100 hover:scale-[1.018] transition-all duration-200 ease-out"
              } ${isCollapsed ? "justify-center h-11 w-11 mx-auto" : "gap-4 px-5 py-4 pr-12 w-full"}`;

            return (
              <div key={item.to} className="space-y-2">
                <div className="flex items-center relative">
                  <NavLink
                    to={item.to}
                    end
                    className={(props) => baseClass(props)}
                    onClick={() => logSidebarEvent("SIDEBAR_NAV_CLICK", { pageKey: item.pageKey, to: item.to, area: "top" })}
                  >
                    {isDashActive && !isCollapsed && <span className="absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-gradient-to-b from-cyan-400 via-cyan-300 to-cyan-500 shadow-[0_0_12px_rgba(0,229,255,0.8)]" />}
                    <item.icon className={`h-6 w-6 shrink-0 ${isDashActive ? ICON_ACTIVE_GLOW : ICON_GLOW}`} />
                    {!isCollapsed && (
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-semibold leading-tight">{labelForItem(item.pageKey, item.label)}</span>
                        {NAV_DESCRIPTIONS[item.pageKey] && (
                          <span className="text-[10px] text-white/35 leading-tight mt-0.5 truncate">{NAV_DESCRIPTIONS[item.pageKey][language] || NAV_DESCRIPTIONS[item.pageKey].de}</span>
                        )}
                      </div>
                    )}
                  </NavLink>

                  {!isCollapsed ? (
                    <button
                      type="button"
                      className={`absolute right-3 p-2 rounded-lg hover:bg-sidebar-accent/50 transition ${isDashActive ? "text-sidebar-primary" : "text-sidebar-foreground"}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const nextOpen = !dashOpen;
                        logSidebarEvent("SIDEBAR_GROUP_TOGGLE", { group: "dashboard", open: nextOpen });
                        setDashOpen(nextOpen);
                      }}
                      aria-label={dashOpen ? t("sidebar.collapseDashboard") : t("sidebar.expandDashboard")}
                    >
                      {dashOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                  ) : null}
                </div>

                {!isCollapsed && dashOpen ? (
                  <div className="ml-10 space-y-1">
                    <NavLink
                      to="/dashboard/statistiken"
                      onClick={() => logSidebarEvent("SIDEBAR_NAV_CLICK", { pageKey: "dashboard_statistics", to: "/dashboard/statistiken", area: "submenu" })}
                      className={({ isActive }) =>
                        `block px-4 py-2 rounded-lg text-sm transition ${isActive
                          ? "bg-blue-500/20 border border-blue-400/20 text-blue-100"
                          : "bg-blue-500/10 border border-blue-400/10 text-sidebar-foreground/65 hover:bg-blue-500/20 hover:border-blue-400/20 hover:text-blue-100 transition-all duration-200 ease-out"
                        }`
                      }
                    >
                      <span className="text-[12px] font-medium">{t("nav.statistics")}</span>
                      <span className="block text-[9px] text-white/30 mt-0.5">{language === 'de' ? 'Auswertungen & KPI-Berichte' : 'Reports & KPI analytics'}</span>
                    </NavLink>
                  </div>
                ) : null}
              </div>
            );
          }

          // Special: expandable Shiftplan
          if (item.to === "/shiftplan") {
            const baseClass = ({ isActive }: { isActive: boolean }) =>
              `relative flex items-center rounded-xl transition-all duration-200 ${isActive || isShiftplanActive
                ? "bg-blue-500/22 border border-blue-400/24 shadow-[0_0_24px_rgba(59,130,246,0.38)] text-blue-100"
                : "bg-blue-500/10 border border-blue-400/10 text-sidebar-foreground/70 hover:bg-blue-500/20 hover:border-blue-400/22 hover:shadow-[0_0_20px_rgba(59,130,246,0.28)] hover:text-blue-100 hover:scale-[1.015] transition-all duration-200 ease-out"
              } ${isCollapsed ? "justify-center h-11 w-11 mx-auto" : "gap-4 px-5 py-4 pr-12 w-full"}`;

            return (
              <div key={item.to} className="space-y-2">
                <div className="flex items-center relative">
                  <NavLink
                    to={item.to}
                    className={(props) => baseClass(props)}
                    onClick={() => logSidebarEvent("SIDEBAR_NAV_CLICK", { pageKey: item.pageKey, to: item.to, area: "top" })}
                  >
                    {isShiftplanActive && !isCollapsed && <span className="absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-gradient-to-b from-blue-400 via-blue-300 to-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />}
                    <item.icon className={`h-6 w-6 shrink-0 ${isShiftplanActive ? ICON_ACTIVE_GLOW : ICON_GLOW}`} />
                    {!isCollapsed && (
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-semibold leading-tight">{labelForItem(item.pageKey, item.label)}</span>
                        {NAV_DESCRIPTIONS[item.pageKey] && (
                          <span className="text-[10px] text-white/35 leading-tight mt-0.5 truncate">{NAV_DESCRIPTIONS[item.pageKey][language] || NAV_DESCRIPTIONS[item.pageKey].de}</span>
                        )}
                      </div>
                    )}
                  </NavLink>

                  {!isCollapsed ? (
                    <button
                      type="button"
                      className={`absolute right-3 p-2 rounded-lg hover:bg-sidebar-accent/50 transition ${isShiftplanActive ? "text-sidebar-primary" : "text-sidebar-foreground"}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const nextOpen = !shiftplanOpen;
                        logSidebarEvent("SIDEBAR_GROUP_TOGGLE", { group: "shiftplan", open: nextOpen });
                        setShiftplanOpen(nextOpen);
                      }}
                      aria-label={shiftplanOpen ? t("sidebar.collapseShiftplan") : t("sidebar.expandShiftplan")}
                    >
                      {shiftplanOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                  ) : null}
                </div>

                {!isCollapsed && shiftplanOpen ? (
                  <div className="ml-10 space-y-1">
                    <NavLink
                      to="/shiftplan/day"
                      onClick={() => logSidebarEvent("SIDEBAR_NAV_CLICK", { pageKey: "shiftplan_day", to: "/shiftplan/day", area: "submenu" })}
                      className={({ isActive }) =>
                        `block px-4 py-2 rounded-lg text-sm transition ${isActive
                          ? "bg-blue-500/20 border border-blue-400/20 text-blue-100"
                          : "bg-blue-500/10 border border-blue-400/10 text-sidebar-foreground/65 hover:bg-blue-500/20 hover:border-blue-400/20 hover:text-blue-100 transition-all duration-200 ease-out"
                        }`
                      }
                    >
                      {t("nav.dayPlanning")}
                    </NavLink>
                    <NavLink
                      to="/shiftplan/week"
                      onClick={() => logSidebarEvent("SIDEBAR_NAV_CLICK", { pageKey: "shiftplan_week", to: "/shiftplan/week", area: "submenu" })}
                      className={({ isActive }) =>
                        `block px-4 py-2 rounded-lg text-sm transition ${isActive
                          ? "bg-blue-500/20 border border-blue-400/20 text-blue-100"
                          : "bg-blue-500/10 border border-blue-400/10 text-sidebar-foreground/65 hover:bg-blue-500/20 hover:border-blue-400/20 hover:text-blue-100 transition-all duration-200 ease-out"
                        }`
                      }
                    >
                      {t("nav.weekPlanning")}
                    </NavLink>
                    {shiftplanChildItems.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        onClick={() => logSidebarEvent("SIDEBAR_NAV_CLICK", { pageKey: child.pageKey, to: child.to, area: "submenu" })}
                        className={({ isActive }) =>
                          `block px-4 py-2 rounded-lg text-sm transition ${isActive
                            ? "bg-blue-500/20 border border-blue-400/20 text-blue-100"
                            : "bg-blue-500/10 border border-blue-400/10 text-sidebar-foreground/65 hover:bg-blue-500/20 hover:border-blue-400/20 hover:text-blue-100 transition-all duration-200 ease-out"
                          }`
                        }
                      >
                        {labelForItem(child.pageKey, child.label)}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }

          // Special: Handover Badge

          if (item.pageKey === "handover") {
            const count = useHandoverStore((s) => s.handovers.filter(h => h.status !== "Erledigt").length);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => logSidebarEvent("SIDEBAR_NAV_CLICK", { pageKey: item.pageKey, to: item.to, area: "top" })}
                className={({ isActive }) =>
                  `relative flex items-center rounded-xl transition-all duration-200 ${isActive
                    ? "bg-blue-500/24 border border-blue-400/28 shadow-[0_0_28px_rgba(59,130,246,0.42),inset_0_0_12px_rgba(59,130,246,0.06)] text-blue-100"
                    : "bg-blue-500/8 border border-blue-400/8 text-sidebar-foreground/70 hover:bg-blue-500/20 hover:border-blue-400/24 hover:shadow-[0_0_24px_rgba(59,130,246,0.32)] hover:text-blue-100 hover:scale-[1.018] transition-all duration-200 ease-out"
                  } ${isCollapsed ? "justify-center h-11 w-11 mx-auto" : "gap-4 px-5 py-4 w-full"}`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && !isCollapsed && <span className="absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-gradient-to-b from-blue-400 via-blue-300 to-blue-500 shadow-[0_0_14px_rgba(59,130,246,0.9)]" />}
                    <div className="relative">
                      <item.icon className={`h-6 w-6 shrink-0 ${isActive ? ICON_ACTIVE_GLOW : ICON_GLOW}`} />
                      {count > 0 && isCollapsed && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                          {count > 9 ? "9+" : count}
                        </span>
                      )}
                    </div>
                    {!isCollapsed && (
                      <div className="flex flex-1 justify-between items-center">
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold leading-tight">{labelForItem(item.pageKey, item.label)}</span>
                          {NAV_DESCRIPTIONS[item.pageKey] && (
                            <span className="text-[10px] text-white/35 leading-tight mt-0.5 truncate">{NAV_DESCRIPTIONS[item.pageKey][language] || NAV_DESCRIPTIONS[item.pageKey].de}</span>
                          )}
                        </div>
                        {count > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white shadow-[0_0_10px_rgba(239,68,68,0.6)]">
                            {count}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            );
          }

          // Standard Item
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => logSidebarEvent("SIDEBAR_NAV_CLICK", { pageKey: item.pageKey, to: item.to, area: "top" })}
              className={({ isActive }) =>
                `relative flex items-center rounded-xl transition-all duration-200 ${isActive
                  ? "bg-blue-500/24 border border-blue-400/28 shadow-[0_0_28px_rgba(59,130,246,0.42),inset_0_0_12px_rgba(59,130,246,0.06)] text-blue-100"
                  : "bg-blue-500/8 border border-blue-400/8 text-sidebar-foreground/70 hover:bg-blue-500/20 hover:border-blue-400/24 hover:shadow-[0_0_24px_rgba(59,130,246,0.32)] hover:text-blue-100 hover:scale-[1.018] transition-all duration-200 ease-out"
                } ${isCollapsed ? "justify-center h-11 w-11 mx-auto" : "gap-4 px-5 py-3.5 w-full"}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !isCollapsed && <span className="absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-gradient-to-b from-blue-400 via-blue-300 to-blue-500 shadow-[0_0_14px_rgba(59,130,246,0.9)]" />}
                  <item.icon className={`h-6 w-6 shrink-0 ${isActive ? ICON_ACTIVE_GLOW : ICON_GLOW}`} />
                  {!isCollapsed && (
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-semibold leading-tight">{labelForItem(item.pageKey, item.label)}</span>
                      {NAV_DESCRIPTIONS[item.pageKey] && (
                        <span className="text-[10px] text-white/35 leading-tight mt-0.5 truncate">{NAV_DESCRIPTIONS[item.pageKey][language] || NAV_DESCRIPTIONS[item.pageKey].de}</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* NAV – BOTTOM */}
      <div className="border-t border-cyan-400/10 p-4 space-y-2">
        {bottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => logSidebarEvent("SIDEBAR_NAV_CLICK", { pageKey: item.pageKey, to: item.to, area: "bottom" })}
            className={({ isActive }) =>
              `relative flex items-center rounded-xl transition-all duration-200 ${isActive
                ? "bg-blue-500/22 border border-blue-400/24 shadow-[0_0_24px_rgba(59,130,246,0.38)] text-blue-100"
                : "bg-blue-500/10 border border-blue-400/10 text-sidebar-foreground/70 hover:bg-blue-500/20 hover:border-blue-400/22 hover:shadow-[0_0_20px_rgba(59,130,246,0.28)] hover:text-blue-100 hover:scale-[1.015] transition-all duration-200 ease-out"
              } ${isCollapsed ? "justify-center h-11 w-11 mx-auto" : "gap-4 px-5 py-4 w-full"}`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && !isCollapsed && <span className="absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-gradient-to-b from-blue-400 via-blue-300 to-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />}
                <item.icon className={`h-6 w-6 shrink-0 ${isActive ? ICON_ACTIVE_GLOW : ICON_GLOW}`} />
                {!isCollapsed && <span>{labelForItem(item.pageKey, item.label)}</span>}
              </>
            )}
          </NavLink>
        ))}

      </div>

      {/* FOOTER */}
      <div className="border-t border-sidebar-border p-4 flex flex-col items-center justify-center gap-1 text-center text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{isCollapsed ? "v1" : "v1.0.0 2026"}</span>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse tracking-widest uppercase">BETA</span>
        </div>
        <button
          type="button"
          onClick={() => {
            logSidebarEvent("SIDEBAR_TUTORIAL_OPEN", {});
            setTutorialOpen(true);
          }}
          className={`theme-glass-inset inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition hover:border-sky-300/30 hover:bg-sky-500/10 hover:text-sky-700 dark:hover:text-sky-100 ${isCollapsed ? "px-2" : ""}`}
          title={t("sidebar.openTutorial")}
        >
          <BookOpen className="h-3.5 w-3.5" />
          {!isCollapsed ? <span>{t("sidebar.tutorial")}</span> : null}
        </button>

        {/* ── SYSTEM STATUS FOOTER ── */}
        {!isCollapsed && (
          <div
            className="mx-2 mb-2 mt-1 rounded-xl border border-emerald-400/14 px-3 py-2.5"
            style={{ background: "rgba(16,185,129,0.04)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                style={{ boxShadow: "0 0 8px 3px rgba(52,211,153,0.7)", animation: "sysOnlinePulse 2.4s ease-in-out infinite" }}
              />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">
                System Online
              </span>
            </div>
            <div className="text-[9px] text-emerald-100/40 tracking-wide">All Nodes Healthy</div>
          </div>
        )}
        {isCollapsed && (
          <div className="flex justify-center mb-3">
            <span
              className="h-2.5 w-2.5 rounded-full bg-emerald-400"
              style={{ boxShadow: "0 0 10px 3px rgba(52,211,153,0.7)", animation: "sysOnlinePulse 2.4s ease-in-out infinite" }}
            />
          </div>
        )}
        <style>{`@keyframes sysOnlinePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.55;transform:scale(1.35)}}`}</style>
      </div>
    </aside>
  );
}
