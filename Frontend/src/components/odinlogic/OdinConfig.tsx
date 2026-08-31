/* ------------------------------------------------ */
/* ODIN CONFIG – Engine settings panel              */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { Settings, Save, RefreshCw } from "lucide-react";
import { fetchEngineConfig, updateEngineConfig, type EngineConfig } from "../../api/engine";

export default function OdinConfig() {
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchEngineConfig()
      .then(setConfig)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateEngineConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof EngineConfig>(key: K, value: EngineConfig[K]) => {
    setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Einstellungen laden...</div>;
  }

  if (!config) {
    return <div className="py-8 text-center text-red-400">Einstellungen konnten nicht geladen werden.</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings className="w-5 h-5 text-indigo-400" />
        <div>
          <h3 className="font-semibold text-sm">Engine-Konfiguration</h3>
          <p className="text-xs text-muted-foreground">Zentrale Parameter der ODIN Assignment Engine.</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* ENGINE ENABLED */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
          <div>
            <div className="text-sm font-medium">Engine aktiv</div>
            <div className="text-xs text-muted-foreground">Wenn deaktiviert, werden keine Runs ausgeführt.</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => update("enabled", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-white/10 peer-checked:bg-indigo-600 rounded-full transition peer-focus:ring-2 peer-focus:ring-indigo-500/50 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition peer-checked:after:translate-x-full" />
          </label>
        </div>

        {/* ENGINE MODE */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
          <div className="text-sm font-medium">Modus</div>
          <div className="text-xs text-muted-foreground mb-2">Shadow = nur Simulation, kein Live-Versand.</div>
          <div className="flex gap-3">
            {(["shadow", "live"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => update("engine_mode", mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                  config.engine_mode === mode
                    ? mode === "shadow"
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                      : "bg-green-500/20 border-green-500/40 text-green-300"
                    : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                }`}
              >
                {mode === "shadow" ? "Shadow" : "Live"}
              </button>
            ))}
          </div>
          {config.engine_mode === "live" && (
            <div className="text-xs text-amber-400 mt-1">⚠ Im Live-Modus werden Zuweisungen aktiv durchgeführt!</div>
          )}
        </div>

        {/* STALE THRESHOLD */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
          <div className="text-sm font-medium">Crawler Stale-Schwelle (Minuten)</div>
          <div className="text-xs text-muted-foreground">Ab dieser Zeitspanne ohne Crawler-Update gelten Daten als veraltet. Die Engine pausiert automatisch.</div>
          <input
            type="number"
            min={1}
            max={60}
            value={config.stale_threshold_minutes}
            onChange={(e) => update("stale_threshold_minutes", Math.max(1, parseInt(e.target.value) || 10))}
            className="w-32 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-indigo-500/50 focus:outline-none"
          />
        </div>

        {/* MAX TICKETS PER PERSON SH */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
          <div className="text-sm font-medium">Max. Tickets pro Person (Server Housing)</div>
          <div className="text-xs text-muted-foreground">Keine weiteren SH-Tickets zuweisen wenn die Person diese Anzahl erreicht hat.</div>
          <input
            type="number"
            min={1}
            max={10}
            value={config.max_tickets_per_person_sh}
            onChange={(e) => update("max_tickets_per_person_sh", Math.max(1, parseInt(e.target.value) || 3))}
            className="w-32 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-indigo-500/50 focus:outline-none"
          />
        </div>

        {/* SIMILAR REMAINING HOURS */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
          <div className="text-sm font-medium">Ähnliche Restlaufzeit-Schwelle (Stunden)</div>
          <div className="text-xs text-muted-foreground">Tickets innerhalb dieser Restlaufzeit-Differenz werden als gleichwertig betrachtet.</div>
          <input
            type="number"
            min={1}
            max={24}
            value={config.similar_remaining_hours_threshold}
            onChange={(e) => update("similar_remaining_hours_threshold", Math.max(1, parseInt(e.target.value) || 6))}
            className="w-32 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-indigo-500/50 focus:outline-none"
          />
        </div>
      </div>

      {/* SAVE BUTTON + FEEDBACK */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition"
        >
          <Save className="w-4 h-4" />
          {saving ? "Speichern..." : "Einstellungen speichern"}
        </button>
        {saved && <span className="text-sm text-green-400">✓ Gespeichert</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}
