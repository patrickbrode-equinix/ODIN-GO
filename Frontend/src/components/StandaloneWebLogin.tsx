import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "../api/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

const SSO_ERRORS_DE: Record<string, string> = {
  not_authorized: "Dein Konto hat keine Administrator-Berechtigung für ODIN GO.",
  flow_expired: "Die Anmeldung ist abgelaufen. Bitte erneut versuchen.",
  provider_error: "Der SSO-Anbieter hat die Anmeldung abgelehnt.",
};
const SSO_ERRORS_EN: Record<string, string> = {
  not_authorized: "Your account has no administrator permission for ODIN GO.",
  flow_expired: "The sign-in expired. Please try again.",
  provider_error: "The SSO provider rejected the sign-in.",
};

function consumeSsoError(isGerman: boolean) {
  const code = sessionStorage.getItem("shiftplanner_sso_error");
  if (!code) return "";
  const known = (isGerman ? SSO_ERRORS_DE : SSO_ERRORS_EN)[code];
  return known || (isGerman ? "SSO-Anmeldung fehlgeschlagen." : "SSO sign-in failed.");
}

export default function StandaloneWebLogin() {
  const { loginToWeb } = useAuth();
  const { language } = useLanguage();
  const isGerman = language === "de";
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => consumeSsoError(isGerman));
  const [submitting, setSubmitting] = useState(false);
  const [sso, setSso] = useState<{ enabled: boolean; providerName: string }>({ enabled: false, providerName: "SSO" });

  useEffect(() => {
    // Read-only in the state initializer (StrictMode runs it twice); clear it once mounted.
    sessionStorage.removeItem("shiftplanner_sso_error");
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get("/auth/sso/config")
      .then((response) => {
        if (!cancelled && response.data?.enabled) {
          setSso({ enabled: true, providerName: String(response.data.providerName || "SSO") });
        }
      })
      .catch(() => { /* password login remains available */ });
    return () => { cancelled = true; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await loginToWeb(password);
      setPassword("");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || (isGerman ? "Anmeldung fehlgeschlagen." : "Sign-in failed."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#12365c_0%,#020617_48%,#01030b_100%)] p-5 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-sky-400/25 bg-slate-950/90 p-7 shadow-2xl shadow-black/50 backdrop-blur">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sky-300">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300/80">ODIN GO</div>
        <h1 className="mt-2 text-2xl font-bold">{isGerman ? "Web-Zugang" : "Web access"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {isGerman
            ? "Admin-Zugang für Übersicht und Administration. Melde dich per SSO an oder gib das Admin-Passwort ein, das auch für den geschützten Bereich in der Extension gilt. Persönliche Einstellungen sind nur in der Extension verfügbar."
            : "Admin access for overview and administration. Sign in with SSO or enter the admin password used for the protected Extension area. Personal settings are only available in the Extension."}
        </p>

        {sso.enabled ? (
          <>
            <a
              href="/api/auth/sso/login"
              className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500"
            >
              <KeyRound className="h-4 w-4" />
              {isGerman ? `Mit ${sso.providerName} anmelden` : `Sign in with ${sso.providerName}`}
            </a>
            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-500">
              <span className="h-px flex-1 bg-slate-700" />
              {isGerman ? "oder Passwort" : "or password"}
              <span className="h-px flex-1 bg-slate-700" />
            </div>
          </>
        ) : null}

        <label htmlFor="odin-web-password" className={`block text-xs font-semibold uppercase tracking-wider text-slate-400 ${sso.enabled ? "" : "mt-6"}`}>
          {isGerman ? "Admin-Passwort" : "Admin password"}
        </label>
        <div className="relative mt-2">
          <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            id="odin-web-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 pl-10 pr-3 text-sm text-white outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
            required
          />
        </div>
        {error ? <div className="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
        <button
          type="submit"
          disabled={!password || submitting}
          className={`mt-5 flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${sso.enabled ? "border border-slate-600 bg-slate-800 hover:bg-slate-700" : "bg-blue-600 hover:bg-blue-500"}`}
        >
          {submitting ? (isGerman ? "Anmeldung wird geprüft…" : "Checking sign-in…") : (isGerman ? "ODIN GO öffnen" : "Open ODIN GO")}
        </button>
      </form>
    </main>
  );
}
