/* ---------------------------------------------------- */
/* HEADER - Premium Glassmorphism Command Bar           */
/* ---------------------------------------------------- */

import { lazy, Suspense, useState, useEffect, useRef, useCallback } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { User, Sun, Moon, Menu, ChevronDown, Activity, Clock, Info, X, Upload, Camera, Trash2, Eye, EyeOff, Database, Gauge, UsersRound, Network } from "lucide-react";

import { api, getNetworkSettings, normalizeApiBaseUrl } from "../api/api";
import { fetchEqixQuote, type MarketQuote } from "../api/market";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "../context/AuthContext";
import { useHealthStatus } from "../hooks/useHealthStatus";
import { getUserDisplayName } from "../utils/userDisplay";
import { useCrawlerStaleness } from "../hooks/useCrawlerStaleness";
import { WeatherDisplay } from "./WeatherDisplay";
import { getFeatureToggles } from "../api/dashboard";
import { FeedbackButton } from "./FeedbackButton";
import { Brain, MessageSquareMore, Vote } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { FlagIcon } from "./FlagIcon";
import { NAV_TOP } from "../config/navigation";
import { IS_SHIFTPLANNER_MODE } from "../config/appMode";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

const HEADER_PANEL_CLASS = "theme-toolbar-panel rounded-2xl";
const HEADER_BUTTON_CLASS = "theme-toolbar-button rounded-lg";
const HEADER_DROPDOWN_CLASS = "theme-popover-surface border-border text-foreground";
const HEADER_DROPDOWN_ITEM_CLASS = "cursor-pointer focus:bg-accent focus:text-accent-foreground";

const DashboardInfoBar = lazy(() => import("./dashboard/DashboardInfoBar").then((module) => ({ default: module.DashboardInfoBar })));
const ProjectsPanel = lazy(() => import("./dashboard/ProjectsPanel").then((module) => ({ default: module.ProjectsPanel })));
const PollsPanel = lazy(() => import("./PollsPanel").then((module) => ({ default: module.PollsPanel })));

type MetricsResponse = {
  uptimeSec?: number;
  process?: { rssMB?: number; heapUsedMB?: number; heapTotalMB?: number };
  system?: { cpuUsagePct?: number | null; memUsedPct?: number; loadavg?: { load1?: number; load5?: number; load15?: number } };
  users?: { onlineCount?: number; totalApproved?: number; recentWindowMinutes?: number };
  database?: { sizeMB?: number; sizePretty?: string | null; connectionCount?: number };
  tickets?: { activeCount?: number; perOnlineUser?: number | null };
  utilization?: { overallPct?: number | null; systemLoadPct?: number | null };
  node?: string;
  timestamp?: string;
};
function formatUptime(sec?: number) {
  if (!Number.isFinite(sec)) return "-";
  const s = Math.floor(sec!);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function fmt1(n?: number | null) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return Number(n).toFixed(1);
}

function formatStorage(sizePretty?: string | null, sizeMB?: number) {
  if (sizePretty) return sizePretty;
  if (sizeMB === null || sizeMB === undefined || !Number.isFinite(sizeMB)) return "-";
  return `${fmt1(sizeMB)} MB`;
}

function formatQuotePrice(price: number | null, currency: string | null) {
  if (price === null || !Number.isFinite(price)) return "--";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
  } catch {
    return `${price?.toFixed(2) ?? "--"} ${currency || "USD"}`;
  }
}

function formatQuoteDelta(changePercent: number | null) {
  if (changePercent === null || !Number.isFinite(changePercent)) return null;
  return `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`;
}

function EqixStockBadge() {
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const loadQuote = async () => {
      try { const nextQuote = await fetchEqixQuote(); if (!alive) return; setQuote(nextQuote); } catch (error) { if (!alive) return; console.error("Failed to fetch EQIX quote", error); } finally { if (alive) setLoading(false); }
    };
    loadQuote();
    const interval = setInterval(loadQuote, 300000);
    return () => { alive = false; clearInterval(interval); };
  }, []);
  const available = quote?.available === true && Number.isFinite(quote?.price);
  const delta = formatQuoteDelta(quote?.changePercent ?? null);
  const positive = (quote?.changePercent ?? 0) >= 0;
  const isGerman = language === "de";
  const title = available ? (isGerman ? `Equinix-Aktie` : `Equinix stock`) : (isGerman ? "Equinix-Aktie nicht verfuegbar" : "Equinix stock unavailable");
  const badgeClass = isLight
    ? "theme-glass-inset hidden h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border border-slate-200/80 bg-white/80 px-3 text-[12px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_4px_12px_rgba(148,163,184,0.10)] sm:flex"
    : "theme-glass-inset hidden h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border border-blue-400/28 bg-[linear-gradient(180deg,rgba(37,99,235,0.14),rgba(255,255,255,0.04))] px-3 text-[12px] font-semibold text-blue-50/84 shadow-[0_0_30px_rgba(37,99,235,0.12),inset_0_1px_0_rgba(255,255,255,0.05)] sm:flex";
  return (
    <div className={badgeClass} title={title}>
      <span className={`h-2 w-2 rounded-full ${available ? (quote?.stale ? "bg-amber-400" : positive ? "bg-emerald-400" : "bg-rose-400") : loading ? "bg-slate-500 animate-pulse" : "bg-slate-500"}`} />
      <span className={isLight ? "font-semibold tracking-wide text-slate-700" : "font-semibold tracking-wide text-blue-50"}>EQIX</span>
      <span className={isLight ? "text-slate-600" : "text-white/82"}>{available ? formatQuotePrice(quote?.price ?? null, quote?.currency ?? null) : "--"}</span>
      {available && delta ? <span className={positive ? (isLight ? "text-emerald-600" : "text-emerald-300") : (isLight ? "text-rose-600" : "text-rose-300")}>{delta}</span> : null}
    </div>
  );
}
const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "London (GMT)", value: "Europe/London" },
  { label: "Berlin (CET)", value: "Europe/Berlin" },
  { label: "Moscow (MSK)", value: "Europe/Moscow" },
  { label: "Dubai (GST)", value: "Asia/Dubai" },
  { label: "India (IST)", value: "Asia/Kolkata" },
  { label: "Bangkok (ICT)", value: "Asia/Bangkok" },
  { label: "Singapore (SGT)", value: "Asia/Singapore" },
  { label: "Tokyo (JST)", value: "Asia/Tokyo" },
  { label: "Sydney (AEDT)", value: "Australia/Sydney" },
  { label: "Los Angeles (PST)", value: "America/Los_Angeles" },
  { label: "Denver (MST)", value: "America/Denver" },
  { label: "Chicago (CST)", value: "America/Chicago" },
  { label: "New York (EST)", value: "America/New_York" },
  { label: "Sao Paulo (BRT)", value: "America/Sao_Paulo" },
];

function getIsoWeekNumber(date: Date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function ClockDisplay() {
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [now, setNow] = useState(new Date());
  const [tz, setTz] = useState(() => localStorage.getItem("app-timezone") || "Europe/Berlin");
  useEffect(() => { localStorage.setItem("app-timezone", tz); }, [tz]);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const formatTime = (date: Date, timezone: string) => {
    try {
      return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
      }).format(date).replace(",", "");
    } catch {
      return "Invalid TZ";
    }
  };
  const btnClass = isLight
    ? "flex h-10 items-center gap-2 whitespace-nowrap rounded-2xl border border-slate-200/80 bg-white/80 px-3 text-[12px] font-semibold tabular-nums text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_4px_12px_rgba(148,163,184,0.10)] transition-all duration-300 hover:border-sky-300/80 hover:bg-white hover:text-sky-800 hover:shadow-[0_8px_24px_rgba(56,189,248,0.14)]"
    : "flex h-10 items-center gap-2 whitespace-nowrap rounded-2xl border border-blue-300/24 bg-[linear-gradient(180deg,rgba(37,99,235,0.24),rgba(12,18,38,0.72))] px-3 text-[12px] font-semibold tabular-nums text-white/84 transition-all duration-300 hover:border-blue-200/34 hover:bg-[linear-gradient(180deg,rgba(59,130,246,0.30),rgba(255,255,255,0.06))] hover:text-white hover:shadow-[0_0_38px_rgba(37,99,235,0.20),inset_0_1px_0_rgba(255,255,255,0.08)]";
  const badgeClass = isLight
    ? "inline-flex items-center rounded-lg border border-sky-200/60 bg-sky-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-sky-700"
    : "inline-flex items-center rounded-lg border border-blue-200/18 bg-[linear-gradient(180deg,rgba(96,165,250,0.20),rgba(37,99,235,0.08))] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-blue-50 shadow-[0_0_22px_rgba(59,130,246,0.16)]";
  const clockIconClass = isLight ? "w-4 h-4 text-sky-600" : "w-4 h-4 text-blue-300 drop-shadow-[0_0_8px_rgba(147,197,253,0.4)]";
  const tzLabelClass = isLight ? "hidden text-[10px] text-slate-400 2xl:inline" : "hidden text-[10px] text-blue-100/34 2xl:inline";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={btnClass}>
          <Clock className={clockIconClass} />
          <span>{formatTime(now, tz)}</span>
          <span className={badgeClass}>
            {language === "de" ? "KW" : "CW"} {getIsoWeekNumber(now)}
          </span>
          <span className={tzLabelClass}>({tz})</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={`${HEADER_DROPDOWN_CLASS} max-h-96 overflow-y-auto`}>
        {TIMEZONES.map((t) => (
          <DropdownMenuItem key={t.value} onClick={() => setTz(t.value)} className={`${HEADER_DROPDOWN_ITEM_CLASS} flex justify-between gap-4`}>
            <span>{t.label}</span>
            {tz === t.value && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function EventsPanel() {
  const { t } = useLanguage();
  const [images, setImages] = useState<Array<{ id: number; url_path: string; original_name?: string; filename: string; created_at: string; is_visible: boolean }>>([]);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = async () => { try { const res = await api.get("/events/images"); setImages(Array.isArray(res.data) ? res.data : []); setLoadError(null); } catch { setLoadError(t("header.imageLoadError")); } };
  useEffect(() => { load(); }, []);
  const handleUpload = async (files: FileList) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try { const form = new FormData(); for (const f of Array.from(files)) form.append("images", f); await api.post("/events/images", form, { headers: { "Content-Type": "multipart/form-data" } }); await load(); } catch { alert(t("header.uploadFailed")); } finally { setUploading(false); }
  };
  const handleDelete = async (id: number) => { if (!window.confirm(t("header.confirmDeleteImage"))) return; try { await api.delete(`/events/images/${id}`); setImages(prev => prev.filter(i => i.id !== id)); } catch { alert(t("header.deleteFailed")); } };
  const handleToggleVisibility = async (id: number, current: boolean) => { try { await api.patch(`/events/images/${id}/visibility`, { is_visible: !current }); setImages(prev => prev.map(i => i.id === id ? { ...i, is_visible: !current } : i)); } catch { alert(t("header.visibilityChangeFailed")); } };
  return (
    <div className="space-y-4">
      <div>
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e => { if (e.target.files) handleUpload(e.target.files); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-sm font-semibold transition disabled:opacity-60"><Upload className="w-4 h-4" />{uploading ? t("header.uploading") : t("header.uploadButton")}</button>
        <p className="text-[11px] text-muted-foreground mt-1">{t("header.fileFormats")}</p>
      </div>
      {loadError && <p className="text-red-400 text-sm">{loadError}</p>}
      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3"><Camera className="w-12 h-12 opacity-20" /><p className="text-sm">{t("header.noImagesAvailable")}</p></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map(img => (
            <div key={img.id} className="theme-glass-inset relative rounded-xl overflow-hidden border border-border/50 bg-background/50 group">
              <img src={img.url_path} alt={img.original_name ?? img.filename} className={`w-full h-28 object-cover transition-opacity ${img.is_visible ? "" : "opacity-30 grayscale"}`} loading="lazy" />
              {!img.is_visible && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><EyeOff className="w-6 h-6 text-white/50" /></div>}
              <div className="flex items-center justify-between px-2 py-1.5 gap-1">
                <span className="text-[11px] text-muted-foreground truncate">{img.original_name ?? img.filename}</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => handleToggleVisibility(img.id, img.is_visible)} className={`shrink-0 p-1 rounded transition ${img.is_visible ? "text-green-500 hover:text-foreground hover:bg-accent/60" : "text-muted-foreground hover:text-green-500 hover:bg-accent/60"}`}>{img.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                  <button onClick={() => handleDelete(img.id)} className="shrink-0 p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function InfosModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"instructions" | "projects" | "events" | "polls">("instructions");
  if (!open) return null;

  const panelFallback = (
    <div className="flex min-h-[240px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/60 border-t-primary" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-9998 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="theme-modal-surface relative z-9999 flex h-[95vh] w-[96vw] max-w-[96vw] flex-col overflow-hidden rounded-2xl border shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex flex-none items-center justify-between border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-3">
            <Info className="w-4 h-4 text-amber-400" />
            <div className="theme-glass-inset flex items-center gap-1 rounded-lg p-1">
              <button onClick={() => setMode("instructions")} className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all ${mode === "instructions" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-muted-foreground hover:text-foreground"}`}>{t("header.instructions")}</button>
              <button onClick={() => setMode("projects")} className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all ${mode === "projects" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "text-muted-foreground hover:text-foreground"}`}>{t("header.projects")}</button>
              <button onClick={() => setMode("events")} className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] font-semibold transition-all ${mode === "events" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-muted-foreground hover:text-foreground"}`}><Camera className="w-3 h-3" />{t("header.events")}</button>
              <button onClick={() => setMode("polls")} className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] font-semibold transition-all ${mode === "polls" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-muted-foreground hover:text-foreground"}`}><Vote className="w-3 h-3" />{t("header.polls")}</button>
            </div>
          </div>
          <button onClick={onClose} className={`${HEADER_BUTTON_CLASS} rounded p-1 transition hover:bg-accent hover:text-foreground`}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 min-h-0">
          {mode === "events" ? (
            <EventsPanel />
          ) : (
            <Suspense fallback={panelFallback}>
              {mode === "instructions" ? <DashboardInfoBar /> : mode === "projects" ? <ProjectsPanel /> : <PollsPanel />}
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

const HEADER_KEYFRAMES = `
@keyframes headerGlowPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.85; } }
@keyframes badgeBreath { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }
@keyframes headerScanBeam { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
@keyframes navGlowSweep { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes premiumSheenSweep { 0% { transform: translateX(-140%); opacity: 0; } 14% { opacity: 0.72; } 100% { transform: translateX(240%); opacity: 0; } }
@keyframes meshFloat1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-12px) scale(1.15)} 66%{transform:translate(-30px,8px) scale(0.92)} }
@keyframes meshFloat2 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(-40px,14px) scale(1.1)} 70%{transform:translate(35px,-8px) scale(0.88)} }
@keyframes tabActiveGlow { 0%,100%{box-shadow:0 0 18px rgba(0,229,255,0.32), 0 0 34px rgba(37,99,235,0.18), inset 0 1px 0 rgba(0,229,255,0.18)} 50%{box-shadow:0 0 30px rgba(0,229,255,0.52), 0 0 56px rgba(37,99,235,0.28), inset 0 1px 0 rgba(0,229,255,0.30)} }
@keyframes brandHaloSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes heroSheen { 0% { transform: translateX(-140%) skewX(-18deg); opacity: 0; } 30% { opacity: 0.55; } 100% { transform: translateX(220%) skewX(-18deg); opacity: 0; } }
@keyframes bannerDrift { 0%,100% { transform: scale(1.02) translate3d(0,0,0); } 50% { transform: scale(1.08) translate3d(1.6%, -1.2%, 0); } }
@keyframes shellPulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.62; } }
`;

/* ── NAV TRANSLATION MAP ── */
const NAV_LABELS: Record<string, Record<string, string>> = {
  dashboard: { de: "Dashboard", en: "Dashboard" },
  shiftplan: { de: "Schichtplan", en: "Shiftplan" },
  handover: { de: "Handover", en: "Handover" },
  tickets: { de: "Tickets", en: "Tickets" },
  odin_logic: { de: "ODIN-Logik", en: "ODIN Logic" },
  tv_dashboard: { de: "TV Modus", en: "TV Mode" },
  commit_compliance: { de: "Crawler", en: "Crawler" },
  shiftplan_control: { de: "Schichtplaner", en: "Shift Planner" },
  teams_center: { de: "Teams", en: "Teams" },
  admin_settings: { de: "Administration", en: "Administration" },
  statistik: { de: "Statistik", en: "Statistics" },
  user_management: { de: "Benutzer", en: "Users" },
};

const NAV_SUBLABELS: Record<string, Record<string, string>> = {
  dashboard: { de: "Live-Überblick", en: "Live overview" },
  shiftplan: { de: "Dienstplanung", en: "Workforce" },
  handover: { de: "Übergabe-Log", en: "Shift log" },
  tickets: { de: "Offene Queue", en: "Open queue" },
  odin_logic: { de: "Entscheidungs-Engine", en: "Decision engine" },
  tv_dashboard: { de: "Teambildschirm", en: "Team display" },
  commit_compliance: { de: "SLA-Tracking", en: "SLA tracking" },
  shiftplan_control: { de: "Monatsplanung", en: "Monthly plan" },
  teams_center: { de: "Benachrichtigungen", en: "Notifications" },
  admin_settings: { de: "Konfiguration", en: "Configuration" },
  statistik: { de: "Auswertungen", en: "Analytics" },
  user_management: { de: "Zugriffsrechte", en: "Access rights" },
};

/** Resolve nav label: uses path-override first, then pageKey, then item.label */
const NAV_PATH_LABEL_KEY: Record<string, string> = {
  "/dashboard/statistiken": "statistik",
};
function getNavLabelKey(item: { to: string; pageKey: string }): string {
  return NAV_PATH_LABEL_KEY[item.to] ?? item.pageKey;
}

const SHIFTPLAN_CHILDREN = [
  { to: "/tagesplanung", label: { de: "Tagesplanung", en: "Day Planning" }, pageKey: "shiftplan" },
  { to: "/shiftplan/week", label: { de: "Wochenplanung", en: "Week Planning" }, pageKey: "shiftplan" },
  { to: "/shiftplan-control", label: { de: "Schichtplaner", en: "Shift Planner" }, pageKey: "shiftplan_control" },
];

const HEADER_BRAND_BANNER = "/odin-assets/odin_brand_banner_reference.png";

export function Header() {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, canAccess } = useAuth();
  const { status, error } = useHealthStatus();
  const { language, languages, setLanguage, t } = useLanguage();
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [infosOpen, setInfosOpen] = useState(false);
  const [metricsVisible, setMetricsVisible] = useState(false);
  const metricsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [teamsActive, setTeamsActive] = useState(false);
  const [odinLogicActive, setOdinLogicActive] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [languageSwitchPending, setLanguageSwitchPending] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [networkUrl, setNetworkUrl] = useState(() => getNetworkSettings().baseUrl);
  const [networkKey, setNetworkKey] = useState(() => getNetworkSettings().apiKey);
  const [networkStatus, setNetworkStatus] = useState<string | null>(null);

  const saveNetworkSettings = async () => {
    const value = networkUrl.trim();
    if (value && !/^https?:\/\//i.test(value)) { setNetworkStatus("Bitte eine gültige VM-Adresse mit http:// oder https:// eingeben."); return; }
    if (value) {
      try { await api.get("/health", { baseURL: normalizeApiBaseUrl(value), timeout: 5000 }); }
      catch { setNetworkStatus("VM nicht erreichbar. Adresse wurde trotzdem gespeichert."); }
    }
    if (value) localStorage.setItem("shiftplanner_vm_url", value); else localStorage.removeItem("shiftplanner_vm_url");
    if (networkKey.trim()) localStorage.setItem("shiftplanner_vm_key", networkKey.trim()); else localStorage.removeItem("shiftplanner_vm_key");
    setNetworkStatus("Netzwerkeinstellungen gespeichert.");
  };

  useEffect(() => {
    const fetchStatus = async () => {
      try { const toggles = await getFeatureToggles(); const teamsKeys = ["teams_tt","teams_update","teams_expedite","teams_assign","teams_info"]; setTeamsActive(teamsKeys.some(k => !!(toggles as any)[k])); } catch {}
      try { const res = await api.get("/assignment/health"); setOdinLogicActive(res.data?.enabled === true); } catch {}
    };
    fetchStatus(); const interval = setInterval(fetchStatus, 30000); return () => clearInterval(interval);
  }, []);

  const [crawlerMeta, setCrawlerMeta] = useState<{ lastUpdate: string | null; count: number; breakdown: { sh: number; tt: number; cc: number } } | null>(null);
  useEffect(() => {
    const fetchMeta = async () => { try { const res = await api.get("/commit/meta"); setCrawlerMeta(res.data); } catch (e) { console.error("Failed to fetch crawler meta", e); } };
    fetchMeta(); const interval = setInterval(fetchMeta, 30000); return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let alive = true;
    const fetchMetrics = async () => { try { const res = await api.get("/metrics"); if (!alive) return; setMetrics(res.data); setMetricsError(null); } catch (e: any) { if (!alive) return; setMetricsError(e?.response?.data?.message ?? "Metrics error"); } };
    fetchMetrics(); const interval = setInterval(fetchMetrics, 10000); return () => { alive = false; clearInterval(interval); };
  }, []);

  const openMetrics = useCallback(() => {
    if (metricsCloseTimerRef.current) { clearTimeout(metricsCloseTimerRef.current); metricsCloseTimerRef.current = null; }
    setMetricsVisible(true);
  }, []);

  const closeMetrics = useCallback(() => {
    if (metricsCloseTimerRef.current) clearTimeout(metricsCloseTimerRef.current);
    metricsCloseTimerRef.current = setTimeout(() => { setMetricsVisible(false); metricsCloseTimerRef.current = null; }, 120);
  }, []);

  useEffect(() => { return () => { if (metricsCloseTimerRef.current) clearTimeout(metricsCloseTimerRef.current); }; }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  const handleLanguageChange = useCallback(async (nextLanguage: string) => {
    if (languageSwitchPending) return;
    if (!languages.some((option) => option.code === nextLanguage)) return;
    if (nextLanguage === language) return;

    setLanguageSwitchPending(true);
    try {
      await setLanguage(nextLanguage as "de" | "en");
    } finally {
      setLanguageSwitchPending(false);
    }
  }, [language, languageSwitchPending, languages, setLanguage]);

  const metricsOk = !!metrics;
  const metricsStale = !!metrics && !!metricsError;
  const cpuPct = metrics?.system?.cpuUsagePct ?? null;
  const memPct = metrics?.system?.memUsedPct ?? null;
  const onlineUsers = metrics?.users?.onlineCount ?? null;
  const totalUsers = metrics?.users?.totalApproved ?? null;
  const dbSize = formatStorage(metrics?.database?.sizePretty, metrics?.database?.sizeMB);
  const overallUtilization = metrics?.utilization?.overallPct ?? null;
  const systemLoadPct = metrics?.utilization?.systemLoadPct ?? null;
  const activeTicketsPerOnlineUser = metrics?.tickets?.perOnlineUser ?? null;
  const displayName = getUserDisplayName(user);
  const activeLanguage = languages.find((entry) => entry.code === language) || languages[0];
  const metricsDockLabel = language === "de" ? "Metriken" : "Metrics";

  const formatDateTime = (iso: string | null | undefined) => {
    if (!iso) return t("header.noUpdateAvailable");
    const d = new Date(iso);
    if (isNaN(d.getTime())) return t("header.noUpdateAvailable");
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const crawlerStaleness = useCrawlerStaleness(crawlerMeta?.lastUpdate ?? null);
  const backendHealthy = status?.backend === "ok";
  const platformStatusLabel = language === "de"
    ? (backendHealthy ? "System online" : "System degradiert")
    : (backendHealthy ? "System online" : "System degraded");
  const isLight = theme === "light";
  const headerActionButtonClass = isLight
    ? "group flex h-11 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/74 px-3.5 text-[12px] font-bold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_12px_28px_rgba(148,163,184,0.10)] transition-all duration-300 hover:border-sky-300/80 hover:bg-white hover:text-sky-800 hover:shadow-[0_18px_36px_rgba(56,189,248,0.16)]"
    : "group flex h-11 items-center gap-2 rounded-xl border border-transparent px-3.5 text-[12px] font-bold text-white/55 transition-all duration-300 hover:border-cyan-400/20 hover:bg-cyan-500/8 hover:text-cyan-100 hover:shadow-[0_0_20px_rgba(0,229,255,0.12)]";
  const headerIconButtonClass = isLight
    ? "flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white/74 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_12px_28px_rgba(148,163,184,0.10)] transition-all duration-300 hover:border-sky-300/80 hover:bg-white hover:text-sky-800 hover:shadow-[0_16px_34px_rgba(56,189,248,0.16)]"
    : "flex h-11 w-11 items-center justify-center rounded-xl border border-transparent text-white/35 transition-all duration-300 hover:border-cyan-400/15 hover:bg-cyan-500/8 hover:text-cyan-200 hover:shadow-[0_0_16px_rgba(0,229,255,0.1)]";
  const headerMenuButtonClass = isLight
    ? "flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white/74 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_12px_28px_rgba(148,163,184,0.10)] transition-all hover:border-sky-300/80 hover:bg-white hover:text-sky-800"
    : "flex h-11 w-11 items-center justify-center rounded-xl text-white/45 transition hover:bg-cyan-500/8 hover:text-cyan-200 lg:hidden";
  const headerLanguageButtonClass = isLight
    ? "flex h-11 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_68%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(246,250,255,0.86))] px-3 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_14px_34px_rgba(148,163,184,0.12),0_0_26px_rgba(56,189,248,0.08)] transition-all duration-300 hover:border-sky-300/80 hover:bg-white hover:text-sky-800 hover:shadow-[0_18px_40px_rgba(56,189,248,0.18),0_0_28px_rgba(56,189,248,0.12)]"
    : "flex h-11 items-center gap-1.5 rounded-xl border border-cyan-400/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_68%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,20,50,0.26))] px-3 text-white/60 shadow-[0_0_20px_rgba(0,229,255,0.08)] transition-all duration-300 hover:border-cyan-400/24 hover:bg-cyan-500/10 hover:text-cyan-100 hover:shadow-[0_0_24px_rgba(0,229,255,0.14)]";
  const headerUserButtonClass = isLight
    ? "group flex h-11 items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/74 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_12px_28px_rgba(148,163,184,0.10)] transition-all duration-300 hover:border-sky-300/80 hover:bg-white hover:shadow-[0_16px_34px_rgba(56,189,248,0.16)]"
    : "group flex h-11 items-center gap-2.5 rounded-xl px-3 transition-all duration-300 hover:bg-white/5";
  const headerUserNameClass = isLight
    ? "hidden max-w-32 truncate text-[12px] font-semibold text-slate-700 group-hover:text-sky-800 xl:block"
    : "hidden max-w-32 truncate text-[12px] font-semibold text-white/45 group-hover:text-white xl:block";
  const metricsButtonClass = metricsVisible
    ? (isLight
      ? "flex h-11 items-center gap-2 rounded-xl border border-sky-300/80 bg-white px-3.5 text-[12px] font-bold text-sky-800 shadow-[0_18px_40px_rgba(56,189,248,0.18)] transition-all duration-300"
      : "flex h-11 items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3.5 text-[12px] font-bold text-cyan-200 shadow-[0_0_20px_rgba(0,229,255,0.15)] transition-all duration-300")
    : (isLight
      ? "flex h-11 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/74 px-3.5 text-[12px] font-bold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_12px_28px_rgba(148,163,184,0.10)] transition-all duration-300 hover:border-sky-300/80 hover:bg-white hover:text-sky-800 hover:shadow-[0_16px_34px_rgba(56,189,248,0.16)]"
      : "flex h-11 items-center gap-2 rounded-xl border border-transparent px-3.5 text-[12px] font-bold text-white/45 transition-all duration-300 hover:border-cyan-400/15 hover:bg-cyan-500/6 hover:text-cyan-100");
  const metricsIconClass = metricsOk
    ? metricsStale
      ? (isLight ? "text-amber-600" : "text-amber-300")
      : (isLight ? "text-sky-600" : "text-cyan-300 drop-shadow-[0_0_6px_rgba(0,229,255,0.5)]")
    : "text-rose-400";
  const metricsPopoverClass = isLight
    ? "relative overflow-hidden rounded-2xl border border-sky-200/80 p-5 text-[13px] backdrop-blur-2xl"
    : "relative overflow-hidden rounded-2xl border border-cyan-400/15 p-5 text-[13px] backdrop-blur-2xl";
  const metricsPopoverStyle = isLight
    ? {
        background: "radial-gradient(ellipse 92% 70% at 50% 0%, rgba(125,211,252,0.26) 0%, rgba(255,255,255,0.98) 46%, rgba(241,245,249,0.985) 100%)",
        boxShadow: "0 32px 72px rgba(148,163,184,0.22), 0 16px 40px rgba(56,189,248,0.12), inset 0 1px 0 rgba(255,255,255,0.96)",
      }
    : {
        background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,180,255,0.06) 0%, rgba(3,9,24,0.98) 60%)",
        boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 60px rgba(0,120,255,0.08)",
      };
  const metricsCardClass = isLight
    ? "rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]"
    : "rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5";
  const metricsCardLabelClass = isLight
    ? "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500"
    : "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40";
  const metricsCardValueClass = isLight
    ? "mt-1.5 text-xl font-black text-slate-900"
    : "mt-1.5 text-xl font-black text-white";
  const metricsCardSubClass = isLight
    ? "text-[10px] text-slate-500"
    : "text-[10px] text-white/35";
  const metricsStatLabelClass = isLight ? "text-[12px] text-slate-500" : "text-white/40 text-[12px]";
  const metricsStatValueClass = isLight ? "font-bold text-slate-900 text-[13px]" : "font-bold text-white text-[13px]";
  const headerDropdownClass = isLight
    ? "rounded-2xl border border-slate-300/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,250,0.98))] text-slate-900 shadow-[0_24px_60px_rgba(148,163,184,0.18),0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl"
    : HEADER_DROPDOWN_CLASS;
  const headerDropdownItemClass = isLight
    ? "cursor-pointer rounded-xl text-slate-700 focus:bg-slate-100 focus:text-slate-950 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-950"
    : HEADER_DROPDOWN_ITEM_CLASS;
  const shiftplanDropdownClass = isLight
    ? "w-[320px] rounded-[26px] border border-slate-300/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.995),rgba(244,247,250,0.99))] p-2 text-slate-900 shadow-[0_28px_70px_rgba(148,163,184,0.22),0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl"
    : "w-[320px] rounded-[26px] border border-cyan-400/18 bg-[radial-gradient(ellipse_at_top,rgba(0,229,255,0.10),transparent_44%),linear-gradient(180deg,rgba(7,16,34,0.98),rgba(3,9,24,0.98))] p-2 text-white shadow-[0_0_36px_rgba(0,229,255,0.12),0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl";
  const shiftplanDropdownItemClass = isLight
    ? "group relative mb-1 flex min-h-[56px] cursor-pointer flex-col items-start justify-center overflow-hidden rounded-[18px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-4 py-3 text-slate-700 shadow-[0_10px_22px_rgba(148,163,184,0.08),inset_0_1px_0_rgba(255,255,255,0.94)] transition-all duration-300 focus:bg-slate-50 focus:text-slate-950 data-[highlighted]:border-sky-300/70 data-[highlighted]:bg-[linear-gradient(160deg,rgba(255,255,255,1),rgba(239,246,255,0.98))] data-[highlighted]:text-slate-950 data-[highlighted]:shadow-[0_18px_36px_rgba(56,189,248,0.12),0_10px_24px_rgba(15,23,42,0.06)]"
    : "group relative mb-1 flex min-h-[56px] cursor-pointer flex-col items-start justify-center overflow-hidden rounded-[18px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-3 text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 focus:bg-[radial-gradient(ellipse_at_top,rgba(0,229,255,0.12),transparent_50%),linear-gradient(180deg,rgba(0,229,255,0.08),rgba(2,7,20,0.96))] focus:text-cyan-100 data-[highlighted]:border-cyan-400/24 data-[highlighted]:bg-[radial-gradient(ellipse_at_top,rgba(0,229,255,0.12),transparent_50%),linear-gradient(180deg,rgba(0,229,255,0.08),rgba(2,7,20,0.96))] data-[highlighted]:text-cyan-100 data-[highlighted]:shadow-[0_0_24px_rgba(0,229,255,0.16),inset_0_1px_0_rgba(255,255,255,0.08)]";

  // Filter nav items based on access
  const visibleNavItems = NAV_TOP.filter((item) => {
    if (item.pageKey === "tv_dashboard" && !user?.isRoot) return false;
    // Skip shiftplan_control since it's in the dropdown
    if (item.pageKey === "shiftplan_control") return false;
    return canAccess(item.pageKey, "view");
  });

  const isNavActive = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);
  const isShiftplanActive = location.pathname.startsWith("/shiftplan") || location.pathname.startsWith("/tagesplanung") || location.pathname.startsWith("/shiftplan-control");

  return (
    <>
      <style>{HEADER_KEYFRAMES}</style>
      <InfosModal open={infosOpen} onClose={() => setInfosOpen(false)} />

      <header className="sticky top-0 z-80 w-full shrink-0 select-none px-2 pt-2 sm:px-3 sm:pt-3 lg:px-4">
        <div
          className="relative overflow-visible rounded-[30px] p-px"
          style={{
            background: isLight
              ? "linear-gradient(132deg, rgba(255,255,255,1.0), rgba(248,248,250,0.998) 25%, rgba(242,243,245,0.994) 55%, rgba(255,255,255,1.0))"
              : "linear-gradient(130deg, rgba(255,255,255,0.18), rgba(0,229,255,0.44) 22%, rgba(37,99,235,0.52) 52%, rgba(14,165,233,0.30) 78%, rgba(255,255,255,0.16))",
            boxShadow: isLight
              ? "0 0 0 1px rgba(0,0,0,0.07), 0 38px 100px rgba(148,163,184,0.20), 0 18px 44px rgba(15,23,42,0.07)"
              : "0 0 0 1px rgba(0,229,255,0.14), 0 0 80px rgba(0,229,255,0.30), 0 0 160px rgba(0,120,255,0.18), 0 38px 96px rgba(0,0,0,0.60)",
          }}
        >
          <div
            className="relative overflow-visible rounded-[29px]"
            style={{
              background: isLight
                ? "radial-gradient(ellipse 120% 90% at 50% -12%, rgba(100,116,139,0.10), transparent 44%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(243,244,246,0.99))"
                : "radial-gradient(ellipse 120% 90% at 50% -12%, rgba(0,229,255,0.12), transparent 46%), linear-gradient(115deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015) 15%, transparent 30%), linear-gradient(180deg, rgba(7,16,34,0.99), rgba(3,9,24,0.985))",
              border: isLight ? "1px solid rgba(148,163,184,0.24)" : "1px solid rgba(255,255,255,0.03)",
            }}
          >
          <div
            className={isLight
              ? "pointer-events-none absolute inset-0 opacity-[0.13]"
              : "pointer-events-none absolute inset-0 opacity-[0.13] mix-blend-screen"
            }
            style={{
              backgroundImage: isLight
                ? `linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.74) 30%, rgba(240,244,249,0.90) 100%), url(${HEADER_BRAND_BANNER})`
                : `linear-gradient(90deg, rgba(2,7,20,0.88) 0%, rgba(2,7,20,0.74) 34%, rgba(2,7,20,0.82) 100%), url(${HEADER_BRAND_BANNER})`,
              backgroundPosition: "left center",
              backgroundSize: "cover",
              filter: isLight ? "saturate(0.9) contrast(1.05) brightness(1.02)" : "saturate(1.15) contrast(1.06)",
              animation: "bannerDrift 24s ease-in-out infinite",
            }}
          />
          <div className={isLight
            ? "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.30),transparent_26%),radial-gradient(ellipse_at_bottom_right,rgba(148,163,184,0.12),transparent_34%),radial-gradient(ellipse_at_center,rgba(56,189,248,0.08),transparent_56%)]"
            : "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(0,229,255,0.16),transparent_34%),radial-gradient(ellipse_at_bottom_right,rgba(37,99,235,0.12),transparent_30%)]"
          } style={{ animation: "shellPulse 8s ease-in-out infinite" }} />

          {/* ── Neon top-edge glow line ── */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: "3px", background: isLight ? "linear-gradient(90deg, transparent 4%, rgba(255,255,255,0.80) 18%, rgba(200,210,220,0.40) 50%, rgba(0,113,227,0.16) 80%, transparent 96%)" : "linear-gradient(90deg, transparent 3%, rgba(0,229,255,0.55) 18%, rgba(0,229,255,1) 50%, rgba(0,229,255,0.55) 82%, transparent 97%)", boxShadow: isLight ? "0 0 20px 4px rgba(255,255,255,0.50)" : "0 0 38px 8px rgba(0,229,255,0.60), 0 0 10px 2px rgba(0,229,255,0.85)" }} />

          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_65%)]" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-40 bg-[linear-gradient(90deg,rgba(255,255,255,0.08),transparent)]" style={{ animation: "heroSheen 9s linear infinite" }} />
          <div className="pointer-events-none absolute inset-y-0 left-[-18%] w-32 opacity-70" style={{ background: isLight ? "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.44) 54%, transparent 100%)" : "linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.18) 54%, transparent 100%)", filter: "blur(18px)", animation: "premiumSheenSweep 10s linear infinite" }} />

          {/* ── Animated scan beam ── */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden opacity-30">
            <div className="absolute top-0 h-full w-1/3" style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.06), transparent)", animation: "headerScanBeam 8s linear infinite" }} />
          </div>

          {/* ── Ambient floating orbs ── */}
          <div className="pointer-events-none absolute -left-20 -top-10 h-56 w-56 rounded-full blur-3xl" style={{ background: isLight ? "radial-gradient(circle,rgba(0,113,227,0.06),transparent 60%)" : "radial-gradient(circle,rgba(0,229,255,0.14),transparent 60%)", animation: "meshFloat1 18s ease-in-out infinite", willChange: "transform" }} />
          <div className="pointer-events-none absolute -right-16 -top-8 h-48 w-48 rounded-full blur-3xl" style={{ background: isLight ? "radial-gradient(circle,rgba(59,130,246,0.06),transparent 60%)" : "radial-gradient(circle,rgba(37,99,235,0.14),transparent 60%)", animation: "meshFloat2 22s ease-in-out infinite", willChange: "transform" }} />

          {/* ── Dot grid watermark ── */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.018]" aria-hidden>
            <defs>
              <pattern id="header-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.7" fill={isLight ? "#0071E3" : "#00E5FF"} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#header-dots)" />
          </svg>

          {/* ── 4-corner bracket accents ── */}
          <svg className="pointer-events-none absolute top-0 left-0 h-5 w-5 opacity-50" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M0 8V0H8" stroke={isLight ? "rgba(0,113,227,0.40)" : "#00E5FF"} strokeWidth="1.5" />
          </svg>
          <svg className="pointer-events-none absolute top-0 right-0 h-5 w-5 opacity-50" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M20 8V0H12" stroke={isLight ? "rgba(0,113,227,0.40)" : "#00E5FF"} strokeWidth="1.5" />
          </svg>
          <svg className="pointer-events-none absolute bottom-0 left-0 h-4 w-4 opacity-30" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M0 12V20H8" stroke={isLight ? "rgba(0,113,227,0.30)" : "#00E5FF"} strokeWidth="1.5" />
          </svg>
          <svg className="pointer-events-none absolute bottom-0 right-0 h-4 w-4 opacity-30" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M20 12V20H12" stroke={isLight ? "rgba(0,113,227,0.30)" : "#00E5FF"} strokeWidth="1.5" />
          </svg>

          {/* ═══ TOP ROW: Branding + Status + Controls ═══ */}
          <div className="relative z-30 flex flex-wrap items-stretch gap-3 px-4 py-4 lg:gap-4 lg:px-6">
            {/* ODIN Logo / Branding – LEFT */}
            <div
              className="relative flex min-w-0 basis-full items-stretch 2xl:basis-auto 2xl:flex-[1.35_1_40rem]"
            >
              <div
                className="relative flex w-full min-w-0 items-center justify-center overflow-hidden rounded-[34px] border px-6 py-6 sm:px-8 lg:min-h-[180px] lg:px-10 lg:py-8 xl:rounded-[36px] 2xl:w-[min(52vw,920px)]"
                style={{
                  background: isLight
                    ? "radial-gradient(ellipse 96% 88% at 12% 50%, rgba(255,255,255,0.36), transparent 42%), radial-gradient(ellipse 88% 76% at 88% 18%, rgba(148,163,184,0.14), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.99), rgba(244,244,246,0.97))"
                    : "radial-gradient(ellipse 96% 88% at 12% 50%, rgba(0,229,255,0.22), transparent 42%), radial-gradient(ellipse 88% 76% at 88% 18%, rgba(37,99,235,0.22), transparent 34%), linear-gradient(145deg, rgba(10,21,44,0.92), rgba(3,9,24,0.88))",
                  borderColor: isLight ? "rgba(148,163,184,0.28)" : "rgba(0,229,255,0.28)",
                  boxShadow: isLight
                    ? "0 34px 80px rgba(148,163,184,0.16), 0 14px 36px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,1.0)"
                    : "0 28px 80px rgba(0,0,0,0.50), 0 0 64px rgba(0,229,255,0.22), 0 0 120px rgba(0,180,255,0.10), inset 0 1px 0 rgba(0,229,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.42)",
                }}
              >
                {/* ── Hero brand banner – fits block size ── */}
                <img
                  src={HEADER_BRAND_BANNER}
                  alt="ODIN Brand"
                  className="keep-brand-banner pointer-events-none absolute inset-0 h-full w-full"
                  style={{
                    objectFit: "cover",
                    objectPosition: "center 32%",
                    transform: "scale(1.015)",
                    filter: isLight ? "saturate(1.08) contrast(1.12) brightness(1.02)" : "saturate(1.4) contrast(1.15) brightness(1.18)",
                  }}
                />
                {/* ── Cinematic edge vignette ── */}
                <div className="pointer-events-none absolute inset-0" style={{
                  background: isLight
                    ? "radial-gradient(ellipse 130% 120% at 50% 50%, transparent 64%, rgba(226,232,240,0.40) 100%)"
                    : "radial-gradient(ellipse 130% 120% at 50% 50%, transparent 68%, rgba(2,7,20,0.42) 100%)",
                }} />
                {/* ── Neon glow overlay ── */}
                <div className={isLight
                  ? "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.24),transparent_46%),radial-gradient(ellipse_at_left,rgba(56,189,248,0.18),transparent_48%),radial-gradient(ellipse_at_right,rgba(148,163,184,0.16),transparent_44%)]"
                  : "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,229,255,0.28),transparent_56%),radial-gradient(ellipse_at_left,rgba(37,99,235,0.22),transparent_44%)]"
                } style={{ animation: "shellPulse 6s ease-in-out infinite" }} />
                {/* ── Top neon edge ── */}
                <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: "2px", background: isLight ? "linear-gradient(90deg, transparent 4%, rgba(56,189,248,0.36) 22%, rgba(59,130,246,0.55) 50%, rgba(56,189,248,0.36) 78%, transparent 96%)" : "linear-gradient(90deg, transparent 4%, rgba(0,229,255,0.5) 22%, rgba(0,229,255,0.9) 50%, rgba(0,229,255,0.5) 78%, transparent 96%)", boxShadow: isLight ? "0 0 14px 2px rgba(56,189,248,0.22)" : "0 0 24px 4px rgba(0,229,255,0.5)" }} />
                {/* ── Bottom subtle edge ── */}
                <div className="pointer-events-none absolute bottom-0 left-4 right-4 h-px" style={{ background: isLight ? "linear-gradient(90deg, transparent, rgba(56,189,248,0.28), transparent)" : "linear-gradient(90deg, transparent, rgba(0,229,255,0.36), transparent)" }} />
                {/* ── Ambient glow orbs ── */}
                <div className="pointer-events-none absolute -left-12 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full blur-2xl" style={{ background: isLight ? "radial-gradient(circle, rgba(56,189,248,0.28), transparent 70%)" : "radial-gradient(circle, rgba(0,229,255,0.34), transparent 70%)", animation: "meshFloat1 14s ease-in-out infinite" }} />
                <div className="pointer-events-none absolute -right-10 top-1/2 h-36 w-36 -translate-y-1/2 rounded-full blur-3xl" style={{ background: isLight ? "radial-gradient(circle, rgba(59,130,246,0.22), transparent 70%)" : "radial-gradient(circle, rgba(37,99,235,0.30), transparent 70%)", animation: "meshFloat2 18s ease-in-out infinite" }} />
              </div>
            </div>

            {/* Status cluster – CENTER */}
            <div
              className="flex min-w-[18rem] flex-[1_1_26rem] flex-wrap items-center gap-2 rounded-[22px] border px-2.5 py-2 lg:px-3"
              style={{
                background: isLight
                  ? "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,250,252,0.94))"
                  : "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,30,70,0.18))",
                borderColor: isLight ? "rgba(148,163,184,0.16)" : "rgba(0,180,255,0.10)",
                boxShadow: isLight
                  ? "inset 0 1px 0 rgba(255,255,255,0.92), 0 18px 40px rgba(148,163,184,0.10)"
                  : "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 24px rgba(0,120,255,0.04)",
              }}
            >
              <ClockDisplay />
              <div className="shrink-0 hidden md:block"><WeatherDisplay /></div>
              <EqixStockBadge />

              {/* Crawler status */}
              <div
                className={`hidden lg:flex h-11 max-w-[320px] shrink items-center gap-2.5 overflow-hidden rounded-xl border px-4 text-[11px] font-black tracking-wide backdrop-blur-sm transition-all duration-500 ${
                  crawlerStaleness.isStale
                    ? (isLight ? "border-rose-300/70 text-rose-700" : "border-red-400/40 text-red-100")
                    : (isLight ? "border-emerald-300/70 text-emerald-800" : "border-emerald-400/30 text-emerald-100")
                }`}
                style={{
                  background: crawlerStaleness.isStale
                    ? (isLight ? "linear-gradient(135deg, rgba(255,241,242,0.98), rgba(255,228,230,0.92))" : "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(185,28,28,0.04))")
                    : (isLight ? "linear-gradient(135deg, rgba(236,253,245,0.98), rgba(209,250,229,0.92))" : "linear-gradient(135deg, rgba(52,211,153,0.10), rgba(16,185,129,0.03))"),
                  boxShadow: crawlerStaleness.isStale
                    ? (isLight ? "inset 0 1px 0 rgba(255,255,255,0.92), 0 14px 30px rgba(244,63,94,0.10)" : "0 0 20px rgba(239,68,68,0.15), inset 0 1px 0 rgba(255,255,255,0.04)")
                    : (isLight ? "inset 0 1px 0 rgba(255,255,255,0.92), 0 14px 30px rgba(16,185,129,0.10)" : "0 0 20px rgba(52,211,153,0.10), inset 0 1px 0 rgba(255,255,255,0.04)"),
                  ...(crawlerStaleness.isStale ? { animation: "badgeBreath 2s ease-in-out infinite" } : {}),
                }}
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                  <span className={`absolute inset-0 rounded-full ${crawlerStaleness.isStale ? "bg-red-400/40" : "bg-emerald-400/40"}`} style={{ animation: "headerGlowPulse 2s ease-in-out infinite" }} />
                  <span className={`relative h-1.5 w-1.5 rounded-full ${crawlerStaleness.isStale ? "bg-red-400 shadow-[0_0_10px_rgba(239,68,68,1)]" : "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,1)]"}`} />
                </span>
                <span className="truncate">
                  {crawlerStaleness.isStale
                    ? <span className="uppercase tracking-widest">{t("header.noCurrentCrawlerData")}</span>
                    : <span className="tabular-nums">{t("header.crawlerUpdate")}: {formatDateTime(crawlerMeta?.lastUpdate ?? null)}</span>}
                </span>
              </div>
            </div>

            {/* Controls – RIGHT */}
            <div
              className="ml-auto flex w-full shrink-0 flex-wrap items-center justify-end gap-2 rounded-[22px] border px-3 py-2 sm:w-auto"
              style={{
                background: isLight
                  ? "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.98))"
                  : "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,20,50,0.24))",
                borderColor: isLight ? "rgba(148,163,184,0.16)" : "rgba(0,180,255,0.10)",
                boxShadow: isLight
                  ? "inset 0 1px 0 rgba(255,255,255,0.94), 0 22px 48px rgba(148,163,184,0.12), 0 10px 24px rgba(56,189,248,0.08)"
                  : "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 24px rgba(0,120,255,0.05)",
              }}
            >
              {/* Infos */}
              <button onClick={() => setInfosOpen(true)} className={headerActionButtonClass} title={t("header.infoAndInstructions")}>
                <Info className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
                <span className="hidden xl:inline">{t("header.infos")}</span>
              </button>

              {/* Feedback */}
              <FeedbackButton variant="header" />

              {/* Teams status */}
              <div
                className={`hidden lg:flex h-11 items-center gap-2.5 rounded-xl border px-3.5 text-[11px] font-black cursor-default transition-all duration-300 ${teamsActive ? (isLight ? "border-emerald-300/70 text-emerald-800" : "border-emerald-400/25 text-emerald-200") : (isLight ? "border-rose-300/65 text-rose-700" : "border-rose-400/20 text-rose-200/70")}`}
                style={{
                  background: teamsActive
                    ? (isLight ? "linear-gradient(135deg, rgba(236,253,245,0.98), rgba(209,250,229,0.92))" : "linear-gradient(135deg, rgba(52,211,153,0.08), rgba(16,185,129,0.02))")
                    : (isLight ? "linear-gradient(135deg, rgba(255,241,242,0.98), rgba(255,228,230,0.92))" : "linear-gradient(135deg, rgba(244,63,94,0.06), rgba(185,28,28,0.02))"),
                  boxShadow: teamsActive
                    ? (isLight ? "inset 0 1px 0 rgba(255,255,255,0.92), 0 14px 30px rgba(16,185,129,0.10)" : "0 0 16px rgba(52,211,153,0.10)")
                    : (isLight ? "inset 0 1px 0 rgba(255,255,255,0.92), 0 14px 30px rgba(244,63,94,0.08)" : "0 0 16px rgba(244,63,94,0.06)"),
                }}
                title={teamsActive ? t("header.teamsActiveTooltip") : t("header.teamsInactiveTooltip")}
              >
                <span className="relative flex h-2 w-2 items-center justify-center">
                  <span className={`absolute inset-0 rounded-full ${teamsActive ? "bg-emerald-400/40" : "bg-rose-400/40"}`} style={{ animation: "headerGlowPulse 2.5s ease-in-out infinite" }} />
                  <span className={`relative h-1.5 w-1.5 rounded-full ${teamsActive ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" : "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,1)]"}`} />
                </span>
                <MessageSquareMore className="w-4.5 h-4.5" />
                <span className="hidden xl:inline">Teams</span>
              </div>

              {/* ODIN Logic status */}
              <div
                className={`hidden lg:flex h-11 items-center gap-2.5 rounded-xl border px-3.5 text-[11px] font-black cursor-default transition-all duration-300 ${odinLogicActive ? (isLight ? "border-emerald-300/70 text-emerald-800" : "border-emerald-400/25 text-emerald-200") : (isLight ? "border-rose-300/65 text-rose-700" : "border-rose-400/20 text-rose-200/70")}`}
                style={{
                  background: odinLogicActive
                    ? (isLight ? "linear-gradient(135deg, rgba(236,253,245,0.98), rgba(209,250,229,0.92))" : "linear-gradient(135deg, rgba(52,211,153,0.08), rgba(16,185,129,0.02))")
                    : (isLight ? "linear-gradient(135deg, rgba(255,241,242,0.98), rgba(255,228,230,0.92))" : "linear-gradient(135deg, rgba(244,63,94,0.06), rgba(185,28,28,0.02))"),
                  boxShadow: odinLogicActive
                    ? (isLight ? "inset 0 1px 0 rgba(255,255,255,0.92), 0 14px 30px rgba(16,185,129,0.10)" : "0 0 16px rgba(52,211,153,0.10)")
                    : (isLight ? "inset 0 1px 0 rgba(255,255,255,0.92), 0 14px 30px rgba(244,63,94,0.08)" : "0 0 16px rgba(244,63,94,0.06)"),
                }}
                title={odinLogicActive ? t("header.odinLogicActiveTooltip") : t("header.odinLogicInactiveTooltip")}
              >
                <span className="relative flex h-2 w-2 items-center justify-center">
                  <span className={`absolute inset-0 rounded-full ${odinLogicActive ? "bg-emerald-400/40" : "bg-rose-400/40"}`} style={{ animation: "headerGlowPulse 2.5s ease-in-out infinite" }} />
                  <span className={`relative h-1.5 w-1.5 rounded-full ${odinLogicActive ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" : "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,1)]"}`} />
                </span>
                <Brain className="w-4.5 h-4.5" />
                <span className="hidden xl:inline">ODIN</span>
              </div>

              {/* Divider */}
              <div className="mx-1.5 h-9 w-px" style={{ background: isLight ? "linear-gradient(180deg, transparent, rgba(56,189,248,0.32), transparent)" : "linear-gradient(180deg, transparent, rgba(0,229,255,0.25), transparent)" }} />

              {/* Metrics */}
              <div className="relative z-40" onMouseEnter={openMetrics} onMouseLeave={closeMetrics}>
                <button className={metricsButtonClass} title={t("header.systemMetrics")}>
                  <Activity className={`h-5 w-5 ${metricsIconClass}`} />
                  <span className="hidden xl:inline uppercase tracking-[0.12em]">{metricsDockLabel}</span>
                </button>
                {metricsVisible && (
                  <div className="pointer-events-auto absolute right-0 top-11 z-[9992] w-[24rem] pt-2">
                    <div className={metricsPopoverClass} style={metricsPopoverStyle}>
                      {/* Top glow line */}
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: isLight ? "linear-gradient(90deg, transparent 10%, rgba(56,189,248,0.55) 50%, transparent 90%)" : "linear-gradient(90deg, transparent 10%, rgba(0,229,255,0.5) 50%, transparent 90%)", boxShadow: isLight ? "0 0 12px rgba(56,189,248,0.22)" : "0 0 12px rgba(0,229,255,0.3)" }} />
                      <div className="mb-4 flex items-center justify-between">
                        <div className={`flex items-center gap-2.5 font-bold ${isLight ? "text-slate-900" : "text-white"}`}><Activity className={`w-4 h-4 ${isLight ? "text-sky-600" : "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]"}`} />{t("header.systemMetrics")}</div>
                        <div className={isLight ? "rounded-full border border-sky-200/80 bg-sky-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.24em] text-sky-700" : "rounded-full border border-cyan-400/20 bg-cyan-500/8 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300/60"}>Live</div>
                      </div>
                      {!metricsOk ? (<div className={isLight ? "rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-sm text-rose-700" : "text-rose-400 text-sm bg-rose-500/10 p-3 rounded-xl border border-rose-500/20"}>{metricsError ?? t("header.notAvailable")}</div>) : (
                        <div className={`space-y-4 ${isLight ? "text-slate-600" : "text-white/60"}`}>
                          {metricsStale && <div className={isLight ? "rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-700" : "rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"}>{language === "de" ? "Letzte erfolgreiche Metriken." : "Last successful metrics."}</div>}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className={metricsCardClass}><div className={metricsCardLabelClass}><UsersRound className="h-3.5 w-3.5 text-sky-400" />{t("header.loggedIn")}</div><div className={metricsCardValueClass}>{onlineUsers ?? "-"}</div><div className={metricsCardSubClass}>{`${onlineUsers ?? "-"} / ${totalUsers ?? "-"} ${t("header.ofApprovedUsers")}`}</div></div>
                            <div className={metricsCardClass}><div className={metricsCardLabelClass}><Gauge className="h-3.5 w-3.5 text-amber-400" />{t("header.utilization")}</div><div className={metricsCardValueClass}>{overallUtilization === null ? "-" : `${fmt1(overallUtilization)}%`}</div><div className={metricsCardSubClass}>{t("header.systemLoad")} {systemLoadPct === null ? "-" : `${fmt1(systemLoadPct)}%`}</div></div>
                            <div className={metricsCardClass}><div className={metricsCardLabelClass}><Database className="h-3.5 w-3.5 text-fuchsia-400" />{t("header.dbStorage")}</div><div className={metricsCardValueClass}>{dbSize}</div><div className={metricsCardSubClass}>{metrics?.database?.connectionCount ?? "-"} {t("header.activeConnections")}</div></div>
                            <div className={metricsCardClass}><div className={metricsCardLabelClass}><Activity className="h-3.5 w-3.5 text-emerald-400" />{t("header.ticketLoad")}</div><div className={metricsCardValueClass}>{metrics?.tickets?.activeCount ?? "-"}</div><div className={metricsCardSubClass}>{activeTicketsPerOnlineUser === null ? "-" : `${fmt1(activeTicketsPerOnlineUser)} ${t("header.ticketsPerUser")}`}</div></div>
                          </div>
                          <div className={`space-y-2 border-t pt-3 ${isLight ? "border-slate-200/80" : "border-white/8"}`}>
                            <div className="flex justify-between items-center"><span className={metricsStatLabelClass}>CPU</span><span className={metricsStatValueClass}>{cpuPct === null ? "-" : `${fmt1(cpuPct)}%`}</span></div>
                            <div className="flex justify-between items-center"><span className={metricsStatLabelClass}>RAM</span><span className={metricsStatValueClass}>{memPct === null ? "-" : `${fmt1(memPct)}%`}</span></div>
                            <div className="flex justify-between items-center"><span className={metricsStatLabelClass}>Node Heap</span><span className={metricsStatValueClass}>{metrics?.process?.heapUsedMB === undefined ? "-" : `${fmt1(metrics?.process?.heapUsedMB)} / ${fmt1(metrics?.process?.heapTotalMB)} MB`}</span></div>
                            <div className="flex justify-between items-center"><span className={metricsStatLabelClass}>Uptime</span><span className={metricsStatValueClass}>{formatUptime(metrics?.uptimeSec)}</span></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Theme toggle */}
              <button onClick={() => { setNetworkStatus(null); setNetworkOpen(true); }} className={headerIconButtonClass} title="Network Settings" aria-label="Network Settings">
                <Network className="w-5 h-5" />
              </button>
              <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} className={headerIconButtonClass}>
                {theme === "light" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* Language */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={headerLanguageButtonClass} disabled={languageSwitchPending} title={language === "de" ? "Sprache auswählen" : "Select language"} aria-label={language === "de" ? "Sprache auswählen" : "Select language"}>
                    <FlagIcon code={activeLanguage.code} />
                    <span className="text-[11px] font-black uppercase tracking-wider">{activeLanguage.shortLabel}</span>
                    <ChevronDown className={`h-3.5 w-3.5 ${isLight ? "text-slate-400" : "text-white/25"}`} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={headerDropdownClass}>
                  <DropdownMenuRadioGroup value={language} onValueChange={handleLanguageChange}>
                    {languages.map((option) => (
                      <DropdownMenuRadioItem key={option.code} value={option.code} className={headerDropdownItemClass} disabled={languageSwitchPending}>
                        <div className="flex items-center gap-2">
                          <FlagIcon code={option.code} />
                          <span className="text-[10px] font-bold uppercase">{option.shortLabel}</span>
                          <span>{option.nativeLabel}</span>
                        </div>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={headerUserButtonClass}>
                    <span className={headerUserNameClass}>{displayName}</span>
                    <div className="relative">
                      <div className="absolute -inset-0.5 rounded-full opacity-50 blur-sm" style={{ background: "conic-gradient(from 0deg, #00E5FF, #0066FF, #7C3AED, #00E5FF)" }} />
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg, #00B4FF, #0066FF, #4F46E5)", boxShadow: "0 0 18px rgba(0,180,255,0.35)" }}>
                        <User className="w-5 h-5 drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
                      </div>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={`${headerDropdownClass} w-48`}>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className={headerDropdownItemClass}>{t("common.settings")}</DropdownMenuItem>
                  {!IS_SHIFTPLANNER_MODE && <DropdownMenuSeparator />}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile hamburger */}
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className={`${headerMenuButtonClass} lg:hidden`}>
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>

          <Dialog open={networkOpen} onOpenChange={setNetworkOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Network Settings</DialogTitle>
                <DialogDescription>VM-Adresse und Zugriffsschlüssel für die Schichtplaner-Verbindung.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <label className="block text-sm font-medium">VM-Adresse / IP
                  <input value={networkUrl} onChange={(event) => setNetworkUrl(event.target.value)} placeholder="https://10.0.0.12:8080" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium">API-Key
                  <input type="password" value={networkKey} onChange={(event) => setNetworkKey(event.target.value)} placeholder="Zugriffsschlüssel" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </label>
                {networkStatus ? <div className="rounded-lg border border-border bg-muted px-3 py-2 text-xs">{networkStatus}</div> : null}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setNetworkOpen(false)} className="rounded-lg border border-border px-3 py-2 text-sm">Abbrechen</button>
                  <button type="button" onClick={() => void saveNetworkSettings()} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">Speichern & testen</button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* ═══ NAVIGATION BAND – Visually Separated ═══ */}
          <nav
            className="odin-stage-frame relative z-10 mx-3 mb-3 hidden overflow-hidden rounded-[30px] lg:mx-5 lg:block"
            style={{
              background: isLight
                ? "radial-gradient(ellipse 110% 90% at 50% -10%, rgba(148,163,184,0.12), transparent 52%), linear-gradient(115deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05) 16%, transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.99), rgba(244,247,250,0.99))"
                : "radial-gradient(ellipse 110% 90% at 50% -10%, rgba(0,180,255,0.14), transparent 52%), linear-gradient(115deg, rgba(255,255,255,0.08), rgba(255,255,255,0.016) 16%, transparent 32%), linear-gradient(180deg, rgba(6,18,40,0.97), rgba(2,7,20,0.99))",
              border: isLight ? "1px solid rgba(148,163,184,0.24)" : "1px solid rgba(0,180,255,0.20)",
              boxShadow: isLight
                ? "0 28px 64px rgba(148,163,184,0.18), 0 12px 28px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.96)"
                : "0 0 56px rgba(0,120,255,0.14), 0 0 100px rgba(0,180,255,0.06), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.38)",
            }}
          >
            <div
              className={isLight
                ? "pointer-events-none absolute inset-0 opacity-[0.04]"
                : "pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-screen"
              }
              style={{
                backgroundImage: isLight
                  ? `linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.88) 20%, rgba(244,247,250,0.94) 100%), url(${HEADER_BRAND_BANNER})`
                  : `linear-gradient(90deg, rgba(2,7,20,0.92) 0%, rgba(2,7,20,0.76) 20%, rgba(2,7,20,0.88) 100%), url(${HEADER_BRAND_BANNER})`,
                backgroundPosition: "center",
                backgroundSize: "cover",
                filter: isLight ? "saturate(0.72) contrast(1.02)" : "saturate(1.08) contrast(1.04)",
                animation: "bannerDrift 28s ease-in-out infinite",
              }}
            />
            {/* Nav band top glow line */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: isLight ? "linear-gradient(90deg, transparent 8%, rgba(0,113,227,0.18) 50%, transparent 92%)" : "linear-gradient(90deg, transparent 8%, rgba(0,229,255,0.35) 30%, rgba(0,180,255,0.5) 50%, rgba(0,229,255,0.35) 70%, transparent 92%)" }} />

            {/* Nav band gradient sweep (subtle) */}
            <div className="pointer-events-none absolute inset-0" style={{ background: isLight ? "transparent" : "linear-gradient(90deg, rgba(0,229,255,0.03), rgba(14,165,233,0.02) 22%, transparent 54%, rgba(37,99,235,0.03) 82%, transparent)", backgroundSize: "200% 100%", animation: isLight ? undefined : "navGlowSweep 12s ease-in-out infinite" }} />
            <div className="pointer-events-none absolute inset-y-0 left-[-18%] w-24 opacity-60" style={{ background: isLight ? "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.34) 55%, transparent 100%)" : "linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.16) 55%, transparent 100%)", filter: "blur(16px)", animation: "premiumSheenSweep 9.5s linear infinite" }} />

            <div className="relative flex items-center gap-3 px-3 py-3">
              <div
                className="odin-stage-frame flex shrink-0 items-center gap-3 rounded-[20px] border px-3.5 py-2.5"
                style={{
                  background: isLight
                    ? "linear-gradient(160deg, rgba(255,255,255,0.98), rgba(244,247,250,0.96))"
                    : "linear-gradient(160deg, rgba(255,255,255,0.05), rgba(0,30,70,0.18))",
                  borderColor: isLight ? "rgba(148,163,184,0.20)" : "rgba(0,180,255,0.12)",
                  boxShadow: isLight
                    ? "0 18px 36px rgba(148,163,184,0.12), inset 0 1px 0 rgba(255,255,255,0.94)"
                    : "0 0 24px rgba(0,120,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-[14px] border ${isLight ? "border-slate-300/70 bg-white shadow-[0_10px_22px_rgba(15,23,42,0.06)]" : "border-cyan-300/14 bg-cyan-400/8 shadow-[0_0_18px_rgba(0,180,255,0.12)]"}`}>
                  <Brain className={`h-4 w-4 ${isLight ? "text-slate-700" : "text-cyan-300 drop-shadow-[0_0_8px_rgba(0,229,255,0.35)]"}`} />
                </div>
                <div>
                  <div className={isLight
                    ? "odin-display-kicker text-[9px] text-slate-500"
                    : "odin-display-kicker text-[9px] text-cyan-200/40"
                  }>
                    {language === "de" ? "Kommandozentrale" : "Command Deck"}
                  </div>
                  <div className={isLight
                    ? "font-display-brand mt-1 text-[13px] font-black tracking-[0.14em] text-slate-900"
                    : "font-display-brand mt-1 text-[13px] font-black tracking-[0.14em] text-white/82"
                  }>
                    {language === "de" ? "Globale Navigation" : "Global Navigation"}
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none pr-1">
              {visibleNavItems.map((item) => {
                // Shiftplan gets a dropdown
                if (item.pageKey === "shiftplan") {
                  return (
                    <DropdownMenu key={item.to}>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`group relative flex h-[60px] min-w-[152px] flex-col items-start justify-center overflow-hidden rounded-[20px] px-3.5 py-2 text-left transition-all duration-300 hover:-translate-y-1 hover:scale-[1.018] ${
                            isShiftplanActive
                              ? (isLight ? "text-slate-900" : "text-cyan-100")
                              : (isLight ? "text-slate-700 hover:text-slate-950" : "text-white/50 hover:text-white/85")
                          }`}
                          style={isShiftplanActive ? {
                            background: isLight
                              ? "linear-gradient(160deg, rgba(255,255,255,1), rgba(244,247,250,0.98) 52%, rgba(239,246,255,0.92))"
                              : "radial-gradient(ellipse 120% 80% at 50% 0%, rgba(0,229,255,0.18), transparent 55%), linear-gradient(160deg, rgba(0,229,255,0.16), rgba(0,60,120,0.12) 48%, rgba(2,7,20,0.92))",
                            border: isLight ? "1px solid rgba(100,116,139,0.28)" : "1px solid rgba(0,229,255,0.28)",
                            boxShadow: isLight
                              ? "0 18px 36px rgba(148,163,184,0.16), 0 10px 24px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.96)"
                              : "0 0 32px rgba(0,229,255,0.26), 0 0 58px rgba(37,99,235,0.18), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,229,255,0.16)",
                            color: isLight ? "rgba(15,23,42,1)" : undefined,
                            textShadow: isLight ? "none" : "0 0 16px rgba(0,229,255,0.78), 0 0 28px rgba(37,99,235,0.32)",
                            animation: isLight ? undefined : "tabActiveGlow 3s ease-in-out infinite",
                          } : {
                            border: isLight ? "1px solid rgba(203,213,225,0.92)" : "1px solid rgba(255,255,255,0.04)",
                            background: isLight
                              ? "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.98))"
                              : "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
                            boxShadow: isLight ? "0 10px 22px rgba(148,163,184,0.10), inset 0 1px 0 rgba(255,255,255,0.94)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                          }}
                        >
                          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)]" />
                          {isShiftplanActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: isLight ? "linear-gradient(180deg, rgba(71,85,105,0.95), rgba(56,189,248,0.72))" : "linear-gradient(180deg, rgba(0,229,255,1), rgba(37,99,235,0.56))", boxShadow: isLight ? "0 0 10px rgba(56,189,248,0.22)" : "0 0 14px rgba(0,229,255,0.58), 0 0 24px rgba(37,99,235,0.24)" }} />}
                          <div className="mb-1 flex w-full items-center gap-2">
                            <span className={`flex h-7 w-7 items-center justify-center rounded-[10px] border ${isShiftplanActive ? (isLight ? "border-slate-300/80 bg-slate-50/92" : "border-cyan-300/22 bg-cyan-400/12") : (isLight ? "border-slate-200/90 bg-white/88" : "border-white/8 bg-white/[0.03]")}`}>
                              <item.icon className={`w-3.5 h-3.5 ${isShiftplanActive ? (isLight ? "text-slate-700" : "text-cyan-300 drop-shadow-[0_0_6px_rgba(0,229,255,0.5)]") : (isLight ? "text-slate-500 group-hover:text-slate-800" : "text-white/40 group-hover:text-white/70")}`} />
                            </span>
                            <span className={`text-[8px] font-black uppercase tracking-[0.24em] ${isShiftplanActive ? (isLight ? "text-slate-500" : "text-cyan-200/65") : (isLight ? "text-slate-400 group-hover:text-slate-600" : "text-white/25 group-hover:text-white/40")}`}>
                              {NAV_SUBLABELS[getNavLabelKey(item)]?.[language] ?? ""}
                            </span>
                            <ChevronDown className={`ml-auto w-3 h-3 ${isShiftplanActive ? (isLight ? "text-slate-500" : "text-cyan-400/60") : (isLight ? "text-slate-400" : "text-white/25")}`} />
                          </div>
                          <span className="font-display-brand text-[12px] font-black tracking-[0.08em]">
                            {NAV_LABELS[getNavLabelKey(item)]?.[language] ?? item.label}
                          </span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" sideOffset={10} className={shiftplanDropdownClass}>
                        <div className={isLight ? "mb-2 rounded-[18px] border border-slate-200/70 bg-white/90 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.96)]" : "mb-2 rounded-[18px] border border-cyan-400/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"}>
                          <div className={isLight ? "text-[9px] font-black uppercase tracking-[0.24em] text-slate-400" : "text-[9px] font-black uppercase tracking-[0.24em] text-cyan-200/42"}>
                            {language === "de" ? "Schichtplan Navigation" : "Shiftplan Navigation"}
                          </div>
                          <div className={isLight ? "mt-1 font-display-brand text-[13px] font-black tracking-[0.08em] text-slate-900" : "mt-1 font-display-brand text-[13px] font-black tracking-[0.08em] text-white/88"}>
                            {language === "de" ? "Planung und Steuerung" : "Planning and control"}
                          </div>
                        </div>
                        <DropdownMenuItem onClick={() => navigate("/shiftplan")} className={shiftplanDropdownItemClass}>
                          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)]" />
                          <span className={isLight ? "text-[9px] font-black uppercase tracking-[0.22em] text-slate-400" : "text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200/42"}>
                            {language === "de" ? "Übersicht" : "Overview"}
                          </span>
                          <span className={isLight ? "mt-1 font-display-brand text-[13px] font-black tracking-[0.08em] text-slate-900" : "mt-1 font-display-brand text-[13px] font-black tracking-[0.08em] text-white/88"}>
                            {language === "de" ? "Schichtplan" : "Shiftplan"}
                          </span>
                        </DropdownMenuItem>
                        {SHIFTPLAN_CHILDREN.filter(c => canAccess(c.pageKey, "view")).map((child) => (
                          <DropdownMenuItem key={child.to} onClick={() => navigate(child.to)} className={shiftplanDropdownItemClass}>
                            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)] opacity-80" />
                            <span className={isLight ? "text-[9px] font-black uppercase tracking-[0.22em] text-slate-400 group-data-[highlighted]:text-sky-500" : "text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200/42 group-data-[highlighted]:text-cyan-200/72"}>
                              {NAV_SUBLABELS[getNavLabelKey(child)]?.[language] ?? (language === "de" ? "Schichtplan" : "Shiftplan")}
                            </span>
                            <span className={isLight ? "mt-1 font-display-brand text-[13px] font-black tracking-[0.08em] text-slate-900" : "mt-1 font-display-brand text-[13px] font-black tracking-[0.08em] text-white/88"}>
                              {child.label[language] ?? child.label.de}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }

                const active = isNavActive(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="group relative flex h-[60px] min-w-[152px] flex-col items-start justify-center overflow-hidden rounded-[20px] px-3.5 py-2 text-left transition-all duration-300 hover:-translate-y-1 hover:scale-[1.018]"
                    style={active ? {
                      background: isLight
                        ? "linear-gradient(160deg, rgba(255,255,255,1), rgba(244,247,250,0.98) 52%, rgba(239,246,255,0.92))"
                        : "radial-gradient(ellipse 120% 80% at 50% 0%, rgba(0,229,255,0.18), transparent 55%), linear-gradient(160deg, rgba(0,229,255,0.16), rgba(0,60,120,0.12) 48%, rgba(2,7,20,0.92))",
                      border: isLight ? "1px solid rgba(100,116,139,0.28)" : "1px solid rgba(0,229,255,0.28)",
                      boxShadow: isLight
                        ? "0 18px 36px rgba(148,163,184,0.16), 0 10px 24px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.96)"
                        : "0 0 32px rgba(0,229,255,0.26), 0 0 58px rgba(37,99,235,0.18), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,229,255,0.16)",
                      color: isLight ? "rgba(15,23,42,1)" : "rgba(178,245,255,1)",
                      textShadow: isLight ? "none" : "0 0 16px rgba(0,229,255,0.78), 0 0 28px rgba(37,99,235,0.32)",
                      animation: isLight ? undefined : "tabActiveGlow 3s ease-in-out infinite",
                    } : {
                      border: isLight ? "1px solid rgba(203,213,225,0.92)" : "1px solid rgba(255,255,255,0.04)",
                      color: isLight ? "rgba(71,85,105,0.78)" : "rgba(255,255,255,0.50)",
                      background: isLight
                        ? "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.98))"
                        : "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
                      boxShadow: isLight ? "0 10px 22px rgba(148,163,184,0.10), inset 0 1px 0 rgba(255,255,255,0.94)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                    }}
                  >
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)]" />
                    {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: isLight ? "linear-gradient(180deg, rgba(71,85,105,0.95), rgba(56,189,248,0.72))" : "linear-gradient(180deg, rgba(0,229,255,1), rgba(37,99,235,0.56))", boxShadow: isLight ? "0 0 10px rgba(56,189,248,0.22)" : "0 0 14px rgba(0,229,255,0.58), 0 0 24px rgba(37,99,235,0.24)" }} />}
                    <div className="mb-1 flex w-full items-center gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-[10px] border ${active ? (isLight ? "border-slate-300/80 bg-slate-50/92" : "border-cyan-300/22 bg-cyan-400/12") : (isLight ? "border-slate-200/90 bg-white/88" : "border-white/8 bg-white/[0.03]")}`}>
                        <item.icon className={`w-3.5 h-3.5 ${active ? (isLight ? "text-slate-700" : "text-cyan-300 drop-shadow-[0_0_6px_rgba(0,229,255,0.5)]") : (isLight ? "text-slate-500 group-hover:text-slate-800" : "text-white/40 group-hover:text-white/70")}`} />
                      </span>
                      <span className={`text-[8px] font-black uppercase tracking-[0.24em] ${active ? (isLight ? "text-slate-500" : "text-cyan-200/65") : (isLight ? "text-slate-400 group-hover:text-slate-600" : "text-white/25 group-hover:text-white/40")}`}>
                        {NAV_SUBLABELS[getNavLabelKey(item)]?.[language] ?? ""}
                      </span>
                    </div>
                    <span className={`font-display-brand text-[12px] font-black tracking-[0.08em] ${active ? "" : (isLight ? "group-hover:text-slate-900" : "group-hover:text-white/85")}`}>
                      {NAV_LABELS[getNavLabelKey(item)]?.[language] ?? item.label}
                    </span>
                  </NavLink>
                );
              })}
              </div>

              {/* System badge (version + status) – right side of nav band */}
              <div
                className="odin-stage-frame ml-auto flex shrink-0 items-center gap-3 rounded-[20px] border px-3.5 py-2.5"
                style={{
                  background: isLight
                    ? "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.96))"
                    : "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,20,50,0.2))",
                  borderColor: backendHealthy ? "rgba(52,211,153,0.16)" : "rgba(244,63,94,0.16)",
                  boxShadow: backendHealthy
                    ? (isLight ? "0 16px 36px rgba(16,185,129,0.08), inset 0 1px 0 rgba(255,255,255,0.92)" : "0 0 24px rgba(52,211,153,0.07), inset 0 1px 0 rgba(255,255,255,0.05)")
                    : (isLight ? "0 16px 36px rgba(244,63,94,0.06), inset 0 1px 0 rgba(255,255,255,0.92)" : "0 0 24px rgba(244,63,94,0.05), inset 0 1px 0 rgba(255,255,255,0.05)"),
                }}
                title={platformStatusLabel}
              >
                <span className="relative flex h-3 w-3 items-center justify-center">
                  <span className={`absolute inset-0 rounded-full ${backendHealthy ? "bg-emerald-400/40" : "bg-rose-400/40"}`} style={{ animation: "headerGlowPulse 2s ease-in-out infinite" }} />
                  <span className={`relative h-2 w-2 rounded-full ${backendHealthy ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,1)]" : "bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,1)]"}`} />
                </span>
                <div className="leading-none">
                  <div className={`text-[8px] font-black uppercase tracking-[0.24em] ${backendHealthy ? (isLight ? "text-emerald-700/80" : "text-emerald-200/55") : (isLight ? "text-rose-700/80" : "text-rose-200/55")}`}>
                    {language === "de" ? "Plattformstatus" : "Platform Status"}
                  </div>
                  <div className={isLight ? "mt-1 text-[11px] font-black text-slate-900" : "mt-1 text-[11px] font-black text-white/86"}>{platformStatusLabel}</div>
                </div>
                <span className={isLight
                  ? "rounded-full border border-sky-200/70 bg-sky-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.22em] text-sky-700"
                  : "rounded-full border border-cyan-300/12 bg-cyan-400/6 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.22em] text-cyan-200/34"
                }>v1.0.0</span>
              </div>
            </div>

            {/* Nav band bottom glow line */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px" style={{ background: "linear-gradient(90deg, transparent 15%, rgba(0,180,255,0.15) 50%, transparent 85%)" }} />
          </nav>
          </div>

        {/* ═══ MOBILE NAV DRAWER ═══ */}
        {mobileMenuOpen && (
          <div className="lg:hidden max-h-[60vh] overflow-y-auto border-t px-4 py-3" style={{ background: isLight ? "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,247,250,0.98))" : "rgba(3,9,24,0.95)", borderColor: isLight ? "rgba(203,213,225,0.88)" : "rgba(0,229,255,0.10)", boxShadow: isLight ? "inset 0 1px 0 rgba(255,255,255,0.92), 0 -18px 40px rgba(148,163,184,0.12)" : undefined, backdropFilter: "blur(12px)" }}>
            <div className="flex flex-col gap-1">
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `flex h-10 items-center gap-2.5 rounded-lg border px-3 text-[12px] font-bold uppercase tracking-[0.06em] transition-all duration-300 ${isActive ? (isLight ? "border-slate-300/80 bg-[linear-gradient(160deg,rgba(255,255,255,1),rgba(244,247,250,0.98))] text-slate-950 shadow-[0_12px_28px_rgba(148,163,184,0.14)]" : "bg-cyan-500/12 text-cyan-200 border-cyan-400/25 shadow-[0_0_14px_rgba(0,229,255,0.12)]") : (isLight ? "border-slate-200/80 bg-white/80 text-slate-700 hover:bg-slate-50 hover:text-slate-950" : "text-white/55 hover:bg-white/5 hover:text-white border-transparent")}`}
                >
                  <item.icon className="w-4 h-4" />
                  {NAV_LABELS[getNavLabelKey(item)]?.[language] ?? item.label}
                </NavLink>
              ))}
              {SHIFTPLAN_CHILDREN.filter(c => canAccess(c.pageKey, "view")).map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  className={({ isActive }) => `group relative flex min-h-[52px] flex-col items-start justify-center overflow-hidden rounded-[18px] border px-4 py-2.5 pl-9 text-left transition-all duration-300 ${isActive ? (isLight ? "border-slate-300/75 bg-[linear-gradient(160deg,rgba(255,255,255,1),rgba(239,246,255,0.98))] text-slate-900 shadow-[0_14px_30px_rgba(56,189,248,0.10),0_8px_18px_rgba(15,23,42,0.05)]" : "border-cyan-400/20 bg-[radial-gradient(ellipse_at_top,rgba(0,229,255,0.10),transparent_52%),linear-gradient(180deg,rgba(0,229,255,0.08),rgba(2,7,20,0.94))] text-cyan-100 shadow-[0_0_20px_rgba(0,229,255,0.14)]") : (isLight ? "border-transparent text-slate-500 hover:border-slate-200/70 hover:bg-slate-50 hover:text-slate-900" : "border-transparent text-white/40 hover:border-cyan-400/10 hover:bg-white/5 hover:text-white")}`}
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]" />
                  <span className={`text-[8px] font-black uppercase tracking-[0.22em] ${isLight ? "text-slate-400 group-hover:text-sky-600" : "text-cyan-200/38 group-hover:text-cyan-200/68"}`}>
                    {NAV_SUBLABELS[getNavLabelKey(child)]?.[language] ?? (language === "de" ? "Schichtplan" : "Shiftplan")}
                  </span>
                  <span className="mt-1 font-display-brand text-[12px] font-black tracking-[0.08em]">
                    {child.label[language] ?? child.label.de}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        )}
        </div>
      </header>
    </>
  );
}
