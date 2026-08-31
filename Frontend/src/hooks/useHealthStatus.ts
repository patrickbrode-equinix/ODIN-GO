/* -------------------------------------------------- */
/* HEALTH STATUS HOOK (ROBUST VERSION)                */
/* -------------------------------------------------- */

import { useEffect, useRef, useState } from "react";

/* -------------------------------------------------- */
/* TYPES                                              */
/* -------------------------------------------------- */

interface HealthStatus {
  backend: "ok" | "error";
  database: "ok" | "error";
  latencyMs: number | null;
  timestamp: string;
}

/* -------------------------------------------------- */
/* HOOK                                               */
/* -------------------------------------------------- */

export function useHealthStatus() {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [error, setError] = useState(false);

  // Zählt aufeinanderfolgende Fehler
  const errorCountRef = useRef(0);

  useEffect(() => {
    let alive = true;

    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/health", {
          cache: "no-store",
        });


        if (!res.ok) {
          throw new Error(`Status request failed (${res.status})`);
        }

        const data: HealthStatus = await res.json();

        if (!alive) return;

        // Erfolg → Fehlerzähler zurücksetzen
        errorCountRef.current = 0;

        setStatus(data);
        setError(false);
      } catch (err) {
        if (!alive) return;

        errorCountRef.current += 1;

        // Erst nach 3 FEHLERN hintereinander auf "error" gehen
        if (errorCountRef.current >= 3) {
          setError(true);
        }

        // WICHTIG:
        // status NICHT auf null setzen → letzte gültige Anzeige behalten
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  return { status, error };
}
