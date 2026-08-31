/* ------------------------------------------------ */
/* TV DASHBOARD PAGE (FIXED LAYOUT)                 */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { Ticket, Monitor } from "lucide-react";
import type { DashboardInfoEntry } from "../../api/dashboard";
import { api } from "../../api/api";
import { TVContent } from "../tv/TVContent";
import { EnterprisePageShell, EnterpriseCard, EnterpriseFeatureHero, EnterpriseHeader, ENT_SECTION_TITLE } from "../layout/EnterpriseLayout";
import { formatDate, formatTime } from "../../utils/dateFormat";
import { WeatherDisplay } from "../WeatherDisplay";
import { useLanguage } from "../../context/LanguageContext";

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

function TVDashboard() {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const [now, setNow] = useState(new Date());
  const [tickets, setTickets] = useState<any[]>([]);
  const [infoEntries, setInfoEntries] = useState<DashboardInfoEntry[]>([]);

  const fetchTickets = async () => {
    try {
      const res = await api.get("/tv/tickets", { params: { limit: 50 } });
      const list = Array.isArray(res.data) ? res.data : [];
      setTickets(list);
    } catch (e) {
      console.error("Failed to fetch tickets for TV", e);
      setTickets([]);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/tv/info-entries");
        setInfoEntries(Array.isArray(res.data?.data) ? res.data.data : []);
      } catch {
        setInfoEntries([]);
      }
    };
    load();
    const int = setInterval(load, 30000);
    return () => clearInterval(int);
  }, []);

  useEffect(() => {
    fetchTickets();
    const int = setInterval(fetchTickets, 60000);
    return () => clearInterval(int);
  }, []);

  return (
    <EnterprisePageShell>
      {/* INFO BAR – Informationen und Anweisungen */}
      {infoEntries.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl mb-4 animate-in slide-in-from-top duration-500 flex flex-col items-center justify-center text-center px-6 py-5"
          style={{
            background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(244,63,94,0.14), rgba(3,9,24,0.98) 65%)",
            border: "1px solid rgba(244,63,94,0.35)",
            boxShadow: "0 0 0 1px rgba(244,63,94,0.12), 0 0 50px rgba(244,63,94,0.12), 0 16px 48px rgba(244,63,94,0.08), inset 0 1px 0 rgba(244,63,94,0.20)",
          }}>
          {/* Neon top edge */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: 2, background: "linear-gradient(90deg, transparent 3%, rgba(244,63,94,0.6) 25%, #f43f5e 50%, rgba(244,63,94,0.6) 75%, transparent 97%)", boxShadow: "0 0 12px 2px rgba(244,63,94,0.4)" }} />
          <div className="max-w-4xl text-center">
            <h2 className="text-[12px] font-black uppercase tracking-[0.22em] text-white mb-1"
              style={{ textShadow: "0 0 20px rgba(244,63,94,0.6)" }}>{isGerman ? "Informationen und Anweisungen" : "Information and instructions"}</h2>
            <div className="space-y-1">
              {infoEntries.map((e) => (
                <p key={e.id} className="text-2xl font-mono text-white whitespace-pre-wrap">{e.content}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <EnterpriseHeader
        title="TV DASHBOARD"
        subtitle={<span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{isGerman ? "Ansicht für Displays im Dienstraum" : "View for displays in the operations room"}</span>}
        icon={<Monitor className="w-5 h-5 text-indigo-400" />}
        rightContent={
          <div className="flex items-center gap-3">
            <WeatherDisplay />
            <div className="text-[11px] font-bold tracking-wider text-muted-foreground bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg flex items-center justify-center">
              {formatDate(now)}
            </div>
            <div className="text-[11px] font-bold tracking-wider text-muted-foreground bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg flex items-center justify-center">
              {formatTime(now)}
            </div>

            <button
              onClick={() => window.open("/tv-fullscreen", "_blank")}
              className="px-4 py-1.5 rounded-lg bg-indigo-600/90 text-white font-bold uppercase tracking-wider text-[11px] hover:bg-indigo-600 transition shadow-sm"
            >
              {isGerman ? "TV Ansicht" : "TV view"}
            </button>
          </div>
        }
      />

      <EnterpriseFeatureHero
        tone="rose"
        eyebrow="Broadcast Surface"
        title="TV Dashboard"
        description={isGerman ? "Operative Lage, Laufband-Infos und Anzeigezustand sind auf eine großflächige Teamflaeche optimiert." : "Operational status, info ticker, and display state are optimized for a large team display."}
        metrics={[
          { label: 'Tickets', value: tickets.length },
          { label: 'Infos', value: infoEntries.length },
          { label: 'Zeit', value: formatTime(now) },
        ]}
      />

      {/* CONTENT – explicit viewport-relative height so TvLayout h-full resolves correctly */}
      <div style={{ height: 'calc(100vh - 180px)', minHeight: 0 }}>
        <TVContent />
      </div>
    </EnterprisePageShell>
  );
}

/* ------------------------------------------------ */
/* EXPORT                                           */
/* ------------------------------------------------ */

export default TVDashboard;
