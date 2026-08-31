import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  Bell,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Droplets,
  Expand,
  FileText,
  FolderKanban,
  HeartPulse,
  LockKeyhole,
  MapPin,
  Minimize2,
  Moon,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  TrendingDown,
  TrendingUp,
  Vote,
  Wind,
  X,
} from "lucide-react";
import { api } from "../../api/api";
import { fetchEqixHistory, fetchEqixQuote, type MarketHistory, type MarketQuote } from "../../api/market";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { FlagIcon } from "../FlagIcon";
import { useTheme } from "../ThemeProvider";
import { PageGuard } from "../../router/PageGuard";
import HeaderWorldClock from "../HeaderWorldClock";

const Shiftplan = lazy(() => import("./Shiftplan"));
const ShiftplanDrafts = lazy(() => import("./ShiftplanDrafts"));
const Weekplan = lazy(() => import("./Weekplan"));
const TagesplanungPage = lazy(() => import("./TagesplanungPage"));
const WellbeingStatistics = lazy(() => import("./WellbeingStatistics"));
const UserPreferencesPage = lazy(() => import("./UserPreferencesPage"));
const AdminSettings = lazy(() => import("./AdminSettings"));
const ShiftplanControlCenter = lazy(() => import("./ShiftplanControlCenter"));
const Users = lazy(() => import("./Users"));
const ProjectsPage = lazy(() => import("./ProjectsPage"));
const JarvisNotifications = lazy(() => import("./JarvisNotifications"));
const ShiftHandover = lazy(() => import("./ShiftHandover"));
const PollsPanel = lazy(() => import("../PollsPanel").then((module) => ({ default: module.PollsPanel })));
const EqixHistoryPanel = lazy(() => import("../EqixHistoryPanel"));

type Staffing = { early: number; late: number; night: number };
type WorkspaceTab = { id: string; label: { de: string; en: string }; path: string; icon: LucideIcon; group: "primary" | "support" | "admin"; admin?: boolean };
type WeatherHour = {
  time: string;
  temperature: number | null;
  apparentTemperature: number | null;
  weatherCode: number | null;
  precipitationProbability: number | null;
  windSpeed: number | null;
};
type WeatherDay = {
  date: string;
  weatherCode: number | null;
  temperatureMax: number | null;
  temperatureMin: number | null;
  precipitationProbability: number | null;
  windSpeedMax: number | null;
  sunrise?: string | null;
  sunset?: string | null;
};
type WeatherSnapshot = {
  available: boolean;
  location?: { city?: string; region?: string; country?: string; source?: "ip" | "fallback" };
  timezone?: string;
  current?: {
    temperature: number | null;
    apparentTemperature: number | null;
    weatherCode: number | null;
    windSpeed: number | null;
    isDay: boolean;
    asOf?: string | null;
  } | null;
  hourly?: WeatherHour[];
  daily?: WeatherDay[];
  stale?: boolean;
};

const PRIMARY_TABS: WorkspaceTab[] = [
  { id: "shiftplan", label: { de: "Dienstplan", en: "Shift Plan" }, path: "/shiftplan", icon: CalendarDays, group: "primary" },
  { id: "week", label: { de: "Wochenplan", en: "Weekly Plan" }, path: "/week", icon: CalendarRange, group: "primary" },
  { id: "day", label: { de: "Tagesplan", en: "Daily Plan" }, path: "/day", icon: CalendarClock, group: "primary" },
  { id: "handover", label: { de: "Schichtübergabe", en: "Shift Handover" }, path: "/handover", icon: ArrowRightLeft, group: "primary" },
  { id: "wellbeing", label: { de: "Wellbeing", en: "Wellbeing" }, path: "/wellbeing", icon: HeartPulse, group: "primary" },
  { id: "projects", label: { de: "Projekte", en: "Projects" }, path: "/projects", icon: FolderKanban, group: "primary" },
  { id: "notifications", label: { de: "Notifications", en: "Notifications" }, path: "/notifications", icon: Bell, group: "primary" },
  { id: "polls", label: { de: "Umfragen", en: "Surveys" }, path: "/polls", icon: Vote, group: "primary" },
];

const SUPPORT_TABS: WorkspaceTab[] = [
  { id: "drafts", label: { de: "Entwürfe", en: "Drafts" }, path: "/drafts", icon: FileText, group: "support" },
  { id: "preferences", label: { de: "Einstellungen", en: "Settings" }, path: "/preferences", icon: SlidersHorizontal, group: "support" },
];

const ADMIN_TABS: WorkspaceTab[] = [
  { id: "admin", label: { de: "Admin-Einstellungen", en: "Admin Settings" }, path: "/admin-settings", icon: LockKeyhole, group: "admin", admin: true },
  { id: "generator", label: { de: "Generator", en: "Generator" }, path: "/generator", icon: LockKeyhole, group: "admin", admin: true },
  { id: "users", label: { de: "Benutzerverwaltung", en: "User Management" }, path: "/users", icon: LockKeyhole, group: "admin", admin: true },
];

function PageLoader() {
  return <div className="flex min-h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" /></div>;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function WeatherIcon({ code, isDay, className = "h-5 w-5" }: { code?: number | null; isDay: boolean; className?: string }) {
  const shared = `${className} shrink-0`;
  if (code === 0 || code === 1) {
    return isDay
      ? <Sun className={`${shared} animate-[odin-weather-sun_12s_linear_infinite] text-amber-300`} />
      : <Moon className={`${shared} animate-[odin-weather-float_3s_ease-in-out_infinite] text-blue-200`} />;
  }
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return <CloudRain className={`${shared} animate-[odin-weather-rain_1.8s_ease-in-out_infinite] text-blue-300`} />;
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return <CloudSnow className={`${shared} animate-[odin-weather-float_3s_ease-in-out_infinite] text-cyan-100`} />;
  }
  if ([95, 96, 99].includes(code)) {
    return <CloudLightning className={`${shared} animate-pulse text-violet-300`} />;
  }
  return <Cloud className={`${shared} animate-[odin-weather-float_3s_ease-in-out_infinite] text-slate-300`} />;
}

function weatherDescription(code?: number | null) {
  if (code === 0) return "Klar";
  if (code === 1) return "Überwiegend klar";
  if (code === 2) return "Leicht bewölkt";
  if (code === 3) return "Bewölkt";
  if ([45, 48].includes(Number(code))) return "Nebel";
  if ([51, 53, 55, 56, 57].includes(Number(code))) return "Nieselregen";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(Number(code))) return "Regen";
  if ([71, 73, 75, 77, 85, 86].includes(Number(code))) return "Schnee";
  if ([95, 96, 99].includes(Number(code))) return "Gewitter";
  return "Wetterlage";
}

function degree(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°` : "–";
}

function percent(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "–";
}

function forecastDayLabel(date: string, index: number, language: "de" | "en") {
  if (index === 0) return language === "de" ? "Heute" : "Today";
  if (index === 1) return language === "de" ? "Morgen" : "Tomorrow";
  return new Date(`${date}T12:00:00`).toLocaleDateString(language === "de" ? "de-DE" : "en-US", { weekday: "short" });
}

function formatMarketPrice(quote: MarketQuote | null) {
  if (!quote?.available || typeof quote.price !== "number" || !Number.isFinite(quote.price)) return "–";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(quote.price));
}

export default function OdinGoWorkspace() {
  const { user } = useAuth();
  const { language, languages, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [staffing, setStaffing] = useState<Staffing | null>(null);
  const [market, setMarket] = useState<MarketQuote | null>(null);
  const [marketHistory, setMarketHistory] = useState<MarketHistory | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [headerRefreshing, setHeaderRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const [marketHistoryLoading, setMarketHistoryLoading] = useState(false);
  const [marketHistoryError, setMarketHistoryError] = useState("");
  const [languagePending, setLanguagePending] = useState(false);
  const weatherPanelRef = useRef<HTMLDivElement>(null);
  const marketPanelRef = useRef<HTMLDivElement>(null);

  const sendBridgeMessage = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (window.parent !== window) window.parent.postMessage({ type, ...payload }, "*");
  }, []);

  const loadStaffing = useCallback(async () => {
    try {
      const { data } = await api.get("/odin-go/overview", { params: { date: localDateKey(new Date()) } });
      const next = data?.staffing || data;
      setStaffing({ early: Number(next?.early || 0), late: Number(next?.late || 0), night: Number(next?.night || 0) });
    } catch {
      // Keep the last valid values visible during a short network interruption.
    }
  }, []);

  const loadMarketAndWeather = useCallback(async () => {
    const [marketResult, weatherResult] = await Promise.allSettled([
      fetchEqixQuote(),
      api.get<WeatherSnapshot>("/odin-go/weather"),
    ]);
    if (marketResult.status === "fulfilled") setMarket(marketResult.value);
    if (weatherResult.status === "fulfilled") setWeather(weatherResult.value.data);
  }, []);

  const loadMarketHistory = useCallback(async () => {
    setMarketHistoryLoading(true);
    setMarketHistoryError("");
    try {
      const history = await fetchEqixHistory();
      setMarketHistory(history);
      if (!history.available || history.points.length < 2) setMarketHistoryError("Der 12-Monats-Verlauf ist momentan nicht verfügbar.");
    } catch {
      setMarketHistoryError("Der 12-Monats-Verlauf konnte nicht geladen werden.");
    } finally {
      setMarketHistoryLoading(false);
    }
  }, []);

  const refreshHeader = useCallback(async () => {
    setHeaderRefreshing(true);
    await Promise.allSettled([loadStaffing(), loadMarketAndWeather()]);
    setHeaderRefreshing(false);
  }, [loadMarketAndWeather, loadStaffing]);

  useEffect(() => {
    void refreshHeader();
    const staffingTimer = window.setInterval(() => void loadStaffing(), 60_000);
    const externalTimer = window.setInterval(() => void loadMarketAndWeather(), 5 * 60_000);
    return () => {
      window.clearInterval(staffingTimer);
      window.clearInterval(externalTimer);
    };
  }, [loadMarketAndWeather, loadStaffing, refreshHeader]);

  useEffect(() => {
    if (!weatherOpen) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!weatherPanelRef.current?.contains(event.target as Node)) setWeatherOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWeatherOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [weatherOpen]);

  useEffect(() => {
    if (!marketOpen) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!marketPanelRef.current?.contains(event.target as Node)) setMarketOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMarketOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [marketOpen]);

  useEffect(() => {
    sendBridgeMessage("ODIN_GO_ACTIVE_PATH", { path: `${location.pathname}${location.search}` });
  }, [location.pathname, location.search, sendBridgeMessage]);

  useEffect(() => {
    // Tell the extension that the React application (not just the iframe
    // document) finished loading. This prevents browser error pages from
    // being mistaken for a healthy ODIN GO instance.
    sendBridgeMessage("ODIN_GO_APP_READY");
  }, [sendBridgeMessage]);

  const openTab = (tab: WorkspaceTab) => {
    const search = location.search;
    navigate(`/odin-go${tab.path}${search}`);
  };

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    sendBridgeMessage("ODIN_GO_TOGGLE_EXPAND", { expanded: next });
  };

  const activePath = location.pathname.replace(/^\/odin-go/, "") || "/shiftplan";
  const usesFixedWorkspaceHeight = activePath === "/week" || activePath === "/day";
  const upcomingHours = (weather?.hourly || [])
    .filter((entry) => new Date(entry.time).getTime() >= Date.now() - 30 * 60 * 1000)
    .slice(0, 6);
  const forecastDays = (weather?.daily || []).slice(0, 7);
  const toggleMarket = () => {
    const next = !marketOpen;
    setMarketOpen(next);
    if (next) {
      setWeatherOpen(false);
      setClockOpen(false);
      if (!marketHistory && !marketHistoryLoading) void loadMarketHistory();
    }
  };

  const renderWorkspaceTab = (tab: WorkspaceTab) => {
    const active = activePath === tab.path || activePath.startsWith(`${tab.path}/`);
    const Icon = tab.icon;
    const label = tab.label[language] || tab.label.de;
    const buttonClass = tab.admin
      ? active
        ? "border-red-400/70 bg-red-600/25 text-red-50 shadow-[0_0_20px_rgba(239,68,68,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]"
        : "border-red-500/35 bg-red-950/35 text-red-200 hover:border-red-400/60 hover:bg-red-900/40 hover:text-red-50"
      : active
        ? "border-blue-400/60 bg-blue-500/20 text-white shadow-[0_0_20px_rgba(59,130,246,0.16),inset_0_1px_0_rgba(255,255,255,0.08)]"
        : "border-slate-700 bg-slate-950/45 text-slate-300 hover:border-slate-500 hover:bg-slate-800 hover:text-white";

    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => openTab(tab)}
        aria-current={active ? "page" : undefined}
        title={tab.admin ? `${label} · ${language === "de" ? "Geschützter Adminbereich" : "Protected admin area"}` : label}
        className={`group flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-semibold transition-all duration-200 ${buttonClass}`}
      >
        <span className={`flex h-6 w-6 items-center justify-center rounded-md border transition ${tab.admin ? "border-red-400/25 bg-red-500/10 text-red-300 group-hover:bg-red-500/20" : active ? "border-blue-300/30 bg-blue-400/15 text-blue-200" : "border-slate-700 bg-slate-900 text-slate-400 group-hover:text-blue-200"}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="odin-go-workspace-shell flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="relative z-40 flex h-24 shrink-0 items-center gap-3 border-b border-slate-700 bg-slate-900 px-4 xl:h-28">
        <div className="flex min-w-0 items-center gap-3">
          <div className="odin-go-logo-shell flex h-[92px] w-[142px] shrink-0 items-center justify-center overflow-visible xl:h-[108px] xl:w-[170px]" aria-hidden="true">
            <img src="/odin-assets/odin-go-hero.png" alt="" className="odin-go-logo-motion h-[90px] w-auto max-w-none object-contain xl:h-[104px]" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-wide text-white">ODIN GO</div>
            <div className="truncate text-[10px] text-slate-400">{language === "de" ? "Zentraler Arbeitsbereich" : "Central Workspace"}</div>
          </div>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-1.5" aria-label="Aktuelle Personalstärke">
          <span className="rounded-md border border-slate-600 border-l-orange-500 bg-slate-950 px-2 py-1.5 text-[10px] font-bold">Früh {staffing?.early ?? "–"}</span>
          <span className="rounded-md border border-slate-600 border-l-yellow-400 bg-slate-950 px-2 py-1.5 text-[10px] font-bold">Spät {staffing?.late ?? "–"}</span>
          <span className="rounded-md border border-slate-600 border-l-blue-500 bg-slate-950 px-2 py-1.5 text-[10px] font-bold">Nacht {staffing?.night ?? "–"}</span>
        </div>

        <div ref={marketPanelRef} className="relative hidden md:block">
          <button
            type="button"
            aria-expanded={marketOpen}
            aria-haspopup="dialog"
            onClick={toggleMarket}
            className={`flex h-11 min-w-32 items-center gap-2 rounded-md border bg-slate-950 px-2.5 text-left transition ${marketOpen ? "border-blue-400 ring-2 ring-blue-500/20" : "border-slate-600 hover:border-slate-500 hover:bg-slate-900"}`}
            title={market?.asOf ? `EQIX · Stand ${new Date(market.asOf).toLocaleString("de-DE")}` : "Equinix Aktienkurs"}
          >
            {Number(market?.changePercent) >= 0
              ? <TrendingUp className="h-4 w-4 animate-[odin-market-pulse_2.6s_ease-in-out_infinite] text-emerald-400" />
              : <TrendingDown className="h-4 w-4 animate-[odin-market-pulse_2.6s_ease-in-out_infinite] text-red-400" />}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[9px] font-bold tracking-wider text-slate-400">EQIX</div>
              <div className="whitespace-nowrap text-[11px] font-bold tabular-nums text-slate-100">
                ${formatMarketPrice(market)}
                {typeof market?.changePercent === "number" && Number.isFinite(market.changePercent) ? <span className={`ml-1 ${market.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>{market.changePercent.toFixed(2)}%</span> : null}
              </div>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${marketOpen ? "rotate-180" : ""}`} />
          </button>

          {marketOpen ? (
            <Suspense fallback={<section role="dialog" aria-label="EQIX Aktienkurs der letzten 12 Monate" className="absolute right-0 top-[52px] z-50 flex h-80 w-[min(560px,calc(100vw-24px))] items-center justify-center rounded-xl border border-slate-600 bg-slate-950 text-sm text-slate-400 shadow-2xl"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Kursansicht wird geladen...</section>}>
              <EqixHistoryPanel market={market} history={marketHistory} loading={marketHistoryLoading} error={marketHistoryError} />
            </Suspense>
          ) : null}
        </div>

        <div ref={weatherPanelRef} className="relative hidden md:block">
          <button
            type="button"
            aria-expanded={weatherOpen}
            aria-haspopup="dialog"
            onClick={() => { setMarketOpen(false); setClockOpen(false); setWeatherOpen((open) => !open); }}
            className={`flex h-11 min-w-32 items-center gap-2 rounded-md border bg-slate-950 px-2.5 text-left transition ${weatherOpen ? "border-blue-400 ring-2 ring-blue-500/20" : "border-slate-600 hover:border-slate-500 hover:bg-slate-900"}`}
            title={weather?.current ? `Gefühlt ${degree(weather.current.apparentTemperature)} · Wind ${degree(weather.current.windSpeed).replace("°", " km/h")}` : "Wetter wird geladen"}
          >
            {weather?.current ? <WeatherIcon code={weather.current.weatherCode} isDay={weather.current.isDay} /> : <Cloud className="h-5 w-5 text-slate-500" />}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="whitespace-nowrap text-[11px] font-bold tabular-nums text-slate-100">{weather?.current ? `${degree(weather.current.temperature)}C` : "Wetter –"}</div>
              <div className="flex max-w-24 items-center gap-1 truncate text-[9px] text-slate-400"><MapPin className="h-2.5 w-2.5 shrink-0" />{weather?.location?.city || (language === "de" ? "Standort" : "Location")}</div>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${weatherOpen ? "rotate-180" : ""}`} />
          </button>

          {weatherOpen ? (
            <section role="dialog" aria-label="Wettervorhersage" className="absolute right-0 top-[52px] z-50 w-[min(520px,calc(100vw-24px))] animate-[odin-weather-panel-in_180ms_ease-out] overflow-hidden rounded-xl border border-slate-600 bg-slate-950 shadow-2xl shadow-black/60">
              <div className="relative overflow-hidden border-b border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 px-5 py-4">
                <div className="odin-weather-panel-glow absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-400/10 blur-2xl" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400"><MapPin className="h-3 w-3" />{weather?.location?.city || (language === "de" ? "Standort" : "Location")}</div>
                    <div className="mt-2 text-3xl font-semibold tabular-nums text-white">{degree(weather?.current?.temperature)}C</div>
                    <div className="mt-1 text-sm font-medium text-slate-200">{weatherDescription(weather?.current?.weatherCode)}</div>
                    <div className="mt-2 flex gap-3 text-[11px] text-slate-400">
                      <span>Gefühlt {degree(weather?.current?.apparentTemperature)}C</span>
                      <span className="flex items-center gap-1"><Wind className="h-3 w-3" />{degree(weather?.current?.windSpeed).replace("°", " km/h")}</span>
                    </div>
                  </div>
                  <WeatherIcon code={weather?.current?.weatherCode} isDay={weather?.current?.isDay ?? true} className="h-16 w-16" />
                </div>
              </div>

              <div className="border-b border-slate-800 px-4 py-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{language === "de" ? "Heute · nächste Stunden" : "Today · next hours"}</div>
                {upcomingHours.length ? (
                  <div className="grid grid-cols-6 gap-1.5">
                    {upcomingHours.map((hour) => (
                      <div key={hour.time} className="rounded-lg border border-slate-800 bg-slate-900/70 px-1.5 py-2 text-center">
                        <div className="text-[9px] font-semibold text-slate-400">{new Date(hour.time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</div>
                        <div className="my-1.5 flex justify-center"><WeatherIcon code={hour.weatherCode} isDay={true} className="h-5 w-5" /></div>
                        <div className="text-xs font-bold tabular-nums text-slate-100">{degree(hour.temperature)}C</div>
                        <div className="mt-1 flex items-center justify-center gap-0.5 text-[9px] text-blue-300"><Droplets className="h-2.5 w-2.5" />{percent(hour.precipitationProbability)}</div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-xs text-slate-500">Stundenprognose wird geladen.</div>}
              </div>

              <div className="px-4 py-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{language === "de" ? "Die nächsten Tage" : "Next days"}</div>
                <div className="space-y-1">
                  {forecastDays.map((day, index) => (
                    <div key={day.date} className="grid grid-cols-[64px_28px_1fr_62px_58px] items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-900">
                      <span className="font-semibold text-slate-200">{forecastDayLabel(day.date, index, language)}</span>
                      <WeatherIcon code={day.weatherCode} isDay={true} className="h-5 w-5" />
                      <span className="truncate text-[10px] text-slate-400">{weatherDescription(day.weatherCode)}</span>
                      <span className="whitespace-nowrap text-right font-bold tabular-nums text-slate-100">{degree(day.temperatureMax)} / <span className="text-slate-500">{degree(day.temperatureMin)}</span></span>
                      <span className="flex items-center justify-end gap-1 text-[10px] text-blue-300"><Droplets className="h-3 w-3" />{percent(day.precipitationProbability)}</span>
                    </div>
                  ))}
                </div>
                {weather?.stale ? <div className="mt-2 text-[10px] text-amber-300">Zuletzt gespeicherte Wetterdaten. Aktualisierung läuft.</div> : null}
                <div className="mt-2 border-t border-slate-800 pt-2 text-right text-[9px] text-slate-600">Prognose: Open-Meteo</div>
              </div>
            </section>
          ) : null}
        </div>

        <HeaderWorldClock
          open={clockOpen}
          onOpenChange={setClockOpen}
          onBeforeOpen={() => { setMarketOpen(false); setWeatherOpen(false); }}
        />

        <div className="hidden max-w-40 truncate text-xs text-slate-300 2xl:block">{user.displayName}</div>
        {user.isAdmin ? <span className="hidden items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-300 sm:inline-flex"><LockKeyhole className="h-3 w-3" />Admin</span> : null}
        <div className="flex items-center gap-1 rounded-md border border-slate-600 bg-slate-950 p-1" aria-label="Sprache auswählen">
          {languages.map((option) => (
            <button
              key={option.code}
              type="button"
              disabled={languagePending || language === option.code}
              onClick={async () => {
                if (language === option.code) return;
                setLanguagePending(true);
                try { await setLanguage(option.code); } finally { setLanguagePending(false); }
              }}
              className={`flex h-7 items-center gap-1 rounded px-1.5 text-[9px] font-bold transition ${language === option.code ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
              title={option.nativeLabel}
              aria-label={option.nativeLabel}
            >
              <FlagIcon code={option.code} />
              <span>{option.shortLabel}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="rounded-md border border-slate-600 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700" title={theme === "light" ? "Dunkelmodus" : "Light mode"} aria-label={theme === "light" ? "Dunkelmodus" : "Light mode"}>
          {theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => void refreshHeader()} className="rounded-md border border-slate-600 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700" title="Headerdaten aktualisieren"><RefreshCw className={`h-4 w-4 ${headerRefreshing ? "animate-spin" : ""}`} /></button>
        <button type="button" onClick={toggleExpanded} className="rounded-md border border-slate-600 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700" title={expanded ? "Fenster verkleinern" : "Fenster vergrößern"}>{expanded ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}</button>
        <button type="button" onClick={() => sendBridgeMessage("ODIN_GO_CLOSE")} className="rounded-md border border-slate-600 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700" title="ODIN GO schließen"><X className="h-4 w-4" /></button>
      </header>

      <nav className="shrink-0 border-b border-slate-700 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950" aria-label="ODIN GO Anwendungen">
        <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2">
          {PRIMARY_TABS.map(renderWorkspaceTab)}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-800 bg-slate-950/45 px-3 py-1.5">
          {SUPPORT_TABS.map(renderWorkspaceTab)}
          <span aria-hidden="true" className="mx-1 h-7 w-px bg-red-500/30" />
          <span className="flex shrink-0 items-center gap-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.15em] text-red-400/80"><LockKeyhole className="h-3 w-3" />{language === "de" ? "Administration" : "Administration"}</span>
          {ADMIN_TABS.map(renderWorkspaceTab)}
        </div>
      </nav>

      <main className={`odin-go-workspace-main min-h-0 min-w-0 flex-1 bg-slate-950 ${usesFixedWorkspaceHeight ? "overflow-hidden" : "overflow-y-auto"}`}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route index element={<Navigate to={`shiftplan${location.search}`} replace />} />
            <Route path="shiftplan" element={<PageGuard pageKey="shiftplan"><Shiftplan /></PageGuard>} />
            <Route path="drafts" element={<PageGuard pageKey="shiftplan_drafts"><ShiftplanDrafts /></PageGuard>} />
            <Route path="week" element={<PageGuard pageKey="shiftplan"><div className="h-full min-h-0 overflow-hidden"><Weekplan /></div></PageGuard>} />
            <Route path="day" element={<PageGuard pageKey="shiftplan"><div className="h-full min-h-0 overflow-hidden"><TagesplanungPage /></div></PageGuard>} />
            <Route path="handover" element={<ShiftHandover />} />
            <Route path="wellbeing" element={<PageGuard pageKey="wellbeing"><WellbeingStatistics /></PageGuard>} />
            <Route path="preferences" element={<PageGuard pageKey="settings"><UserPreferencesPage /></PageGuard>} />
            <Route path="admin-settings" element={<PageGuard pageKey="admin_settings" min="write"><AdminSettings /></PageGuard>} />
            <Route path="generator" element={<PageGuard pageKey="shiftplan_control" min="write"><ShiftplanControlCenter /></PageGuard>} />
            <Route path="users" element={<PageGuard pageKey="user_management" min="write"><Users /></PageGuard>} />
            <Route path="projects" element={<ProjectsPage />} />
             <Route path="notifications" element={<JarvisNotifications />} />
             <Route path="polls" element={<PollsPanel />} />
            <Route path="*" element={<Navigate to={`shiftplan${location.search}`} replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
