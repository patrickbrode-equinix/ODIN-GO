import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { HandoverList } from "../handover/HandoverList";
import type { HandoverItem } from "../handover/handover.types";

/* Use the public /api/tv/handover endpoint – no auth required */
async function loadHandoversPublic(): Promise<HandoverItem[]> {
  const res = await fetch("/api/tv/handover");
  if (!res.ok) throw new Error(`TV handover fetch failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((item: any) => ({
    ...item,
    commitAt: item.commitAt ?? item.commit_at ?? null,
    status: item.status || "Offen",
    files: [],
  }));
}

export function TVHandoverMirror() {
  const [handovers, setHandovers] = useState<HandoverItem[]>([]);

  const reload = async () => {
    try {
      const data = await loadHandoversPublic();
      setHandovers(data.filter((h) => h.status !== "Erledigt"));
    } catch (e) {
      console.warn("[TVHandoverMirror] reload failed:", e);
    }
  };

  useEffect(() => {
    reload();
    const i = setInterval(reload, 15_000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[26px] border"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 18%, rgba(4,11,26,0.96) 65%, rgba(2,8,20,0.98) 100%)",
        borderColor: "rgba(56,189,248,0.18)",
        boxShadow: "0 0 0 1px rgba(56,189,248,0.08), 0 0 70px rgba(56,189,248,0.1), 0 24px 60px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)",
      }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 12%, transparent 28%), radial-gradient(circle at 86% 16%, rgba(56,189,248,0.14), transparent 34%)" }} />
      {/* Neon top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10" style={{ height: 1, background: "linear-gradient(90deg, transparent 5%, rgba(56,189,248,0.4) 30%, rgba(56,189,248,0.7) 50%, rgba(56,189,248,0.4) 70%, transparent 95%)", boxShadow: "0 0 8px 1px rgba(56,189,248,0.2)" }} />
      <div className="relative z-10 flex items-center justify-between gap-4 border-b border-white/8 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border" style={{ background: "linear-gradient(135deg, rgba(56,189,248,0.28), rgba(56,189,248,0.08))", borderColor: "rgba(56,189,248,0.34)", boxShadow: "0 0 24px rgba(56,189,248,0.22)" }}>
            <ClipboardList className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <div className="text-[15px] font-black uppercase tracking-[0.22em] text-white" style={{ textShadow: "0 0 22px rgba(56,189,248,0.24)" }}>Handover Board</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Offene Uebergaben mit TV-fokussierter Lesbarkeit</div>
          </div>
        </div>
        <div className="rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.22), rgba(3,9,24,0.95) 80%)", border: "1px solid rgba(56,189,248,0.28)", color: "#bae6fd", boxShadow: "0 0 22px rgba(56,189,248,0.18)" }}>
          {handovers.length} offen
        </div>
      </div>
      <HandoverList
        handovers={handovers}
        showCompleted={false}
        currentUser=""
        onTakeOver={() => { }}
        onComplete={() => { }}
        onDelete={() => { }}
        onRestore={() => { }}
      />
    </div>
  );
}

