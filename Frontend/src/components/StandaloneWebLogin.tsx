import { useState, type FormEvent } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export default function StandaloneWebLogin() {
  const { loginToWeb } = useAuth();
  const { language } = useLanguage();
  const isGerman = language === "de";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
            ? "Notzugang und Zugang für Vorgesetzte. Verwende dasselbe Passwort wie für den geschützten Bereich in der Extension."
            : "Emergency and supervisor access. Use the same password as for the protected area in the extension."}
        </p>
        <label htmlFor="odin-web-password" className="mt-6 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          {isGerman ? "Passwort" : "Password"}
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
            autoFocus
            required
          />
        </div>
        {error ? <div className="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
        <button
          type="submit"
          disabled={!password || submitting}
          className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (isGerman ? "Anmeldung wird geprüft…" : "Checking sign-in…") : (isGerman ? "ODIN GO öffnen" : "Open ODIN GO")}
        </button>
      </form>
    </main>
  );
}
