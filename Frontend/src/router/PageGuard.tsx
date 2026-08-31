import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { AccessLevel } from "../context/AuthContext";
import AccessDenied from "../components/pages/AccessDenied";
import { getDefaultRouteForCurrentMode, IS_SHIFTPLANNER_MODE } from "../config/appMode";

type Props = {
  pageKey: string;
  min?: AccessLevel;
  anyOf?: Array<{
    pageKey: string;
    min?: AccessLevel;
  }>;
  children: React.ReactNode;
};

const ADMIN_UNLOCK_PAGE_KEYS = new Set(["admin_settings", "shiftplan_control", "user_management", "teams_center", "protokoll"]);

function AdminUnlockGate() {
  const { unlockAdmin } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await unlockAdmin(password);
      setPassword("");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || requestError?.message || "Admin-Freigabe fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-7 shadow-xl">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-bold text-slate-100">Geschuetzter Adminbereich</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Admin Settings, Generator und User Management werden mit dem Admin-Passwort freigeschaltet.
        </p>
        <label className="mt-6 block text-xs font-semibold uppercase tracking-wider text-slate-400" htmlFor="shiftplanner-admin-password">
          Admin-Passwort
        </label>
        <input
          id="shiftplanner-admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
          autoFocus
          required
        />
        {error ? <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div> : null}
        <button
          type="submit"
          disabled={submitting || !password}
          className="mt-5 h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Freigabe wird geprueft..." : "Adminbereich oeffnen"}
        </button>
      </form>
    </div>
  );
}

export function PageGuard({
  pageKey,
  min = "view",
  anyOf,
  children,
}: Props) {
  const { canAccess } = useAuth();
  const location = useLocation();
  const defaultRoute = getDefaultRouteForCurrentMode();

  /* ------------------------------- */
  /* ACCESS CHECK                    */
  /* ------------------------------- */
  const isAllowed = canAccess(pageKey, min)
    || (anyOf || []).some((requirement) => canAccess(requirement.pageKey, requirement.min || "view"));

  if (!isAllowed) {
    if (IS_SHIFTPLANNER_MODE && ADMIN_UNLOCK_PAGE_KEYS.has(pageKey)) {
      return <AdminUnlockGate />;
    }

    // If we are already at the mode-specific fallback, show AccessDenied to prevent infinite loops.
    if (location.pathname === defaultRoute) {
      return <AccessDenied />;
    }

    return <Navigate to={defaultRoute} replace />;
  }

  /* ------------------------------- */
  /* ALLOWED                         */
  /* ------------------------------- */
  return <>{children}</>;
}
