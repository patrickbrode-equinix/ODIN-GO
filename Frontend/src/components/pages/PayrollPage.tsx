/* ------------------------------------------------ */
/* Payroll ("Abrechnung") – personal, end-to-end     */
/* encrypted estimate of the monthly pay slip.       */
/* ------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Lock, LockKeyhole, Pencil, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { api } from "../../api/api";
import { PayrollProfileForm } from "../payroll/PayrollProfileForm";
import { PayrollStatement, type MonthShift, type MonthTotals } from "../payroll/PayrollStatement";
import { calculateMonth, type PayrollProfile } from "../../utils/payrollEngine";
import {
  decryptProfile, deriveKey, encryptProfile, forgetKeyForTab, fromBase64, KDF_ITERATIONS, rememberKeyForTab, restoreKeyForTab, type EncryptedProfile,
} from "../../utils/payrollCrypto";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const REFRESH_MS = 60_000;

type Phase = "loading" | "unavailable" | "create-password" | "setup" | "locked" | "ready" | "edit";

const Disclaimer = () => (
  <div role="note" className="flex gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-100">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <p>
      <b>Wichtiger Hinweis:</b> Diese Abrechnung ist eine reine <b>Näherung</b> und keine Gehaltsabrechnung. Sie rechnet vereinfacht mit den Werten für Hessen
      (Einkommensteuertarif und Sozialversicherung 2026, Kirchensteuer 9 %, Zuschlagsbegrenzungen nach Betriebsvorgabe). Abweichungen durch individuelle Merkmale,
      Einmalzahlungen, Besonderheiten der Steuerklassen 5 und 6, Beitragsbemessungsgrenzen oder spätere Gesetzesänderungen sind möglich. Verbindlich ist allein die
      Abrechnung der Entgeltabrechnung des Arbeitgebers.
    </p>
  </div>
);

function PrivacyNote() {
  return (
    <div className="flex gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-xs leading-relaxed text-emerald-100">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <b>Nur du kannst deine Daten lesen.</b> Deine Angaben werden in deinem Browser mit einem Schlüssel aus deinem Abrechnungs-Passwort verschlüsselt (AES-256).
        Auf dem Server und in der Datenbank liegt nur der verschlüsselte Block: Administratoren und Datenbankbetreiber können Gehalt, Steuerklasse oder Kinder nicht einsehen.
        Das Passwort wird nirgends gespeichert und kann nicht zurückgesetzt werden. Bei Verlust löschst du das Profil und legst es neu an.
      </p>
    </div>
  );
}

export default function PayrollPage() {
  const now = new Date();
  const [phase, setPhase] = useState<Phase>("loading");
  const [stored, setStored] = useState<EncryptedProfile | null>(null);
  const [profile, setProfile] = useState<PayrollProfile | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const saltRef = useRef<Uint8Array | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [hours, setHours] = useState<{ totals: MonthTotals | null; shifts: MonthShift[]; matched: boolean; planned: boolean }>({ totals: null, shifts: [], matched: true, planned: true });

  /* ---- load the encrypted profile and try the key of this tab ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get("/payroll/profile");
        if (cancelled) return;
        if (!response.data?.exists) { setPhase("create-password"); return; }
        const payload = response.data.profile as EncryptedProfile;
        setStored(payload);
        saltRef.current = fromBase64(payload.salt);
        const remembered = await restoreKeyForTab();
        if (remembered) {
          try {
            const decrypted = await decryptProfile(payload, remembered);
            keyRef.current = remembered;
            setProfile(decrypted);
            setPhase("ready");
            return;
          } catch { /* key of an old profile: ask for the password */ }
        }
        setPhase("locked");
      } catch (requestError: any) {
        if (cancelled) return;
        setError(requestError?.response?.data?.message || "Die Abrechnung konnte nicht geladen werden.");
        setPhase("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---- plan hours: reloaded every minute and when the tab is focused again (swapped shifts, new supplements) ---- */
  const loadHours = useCallback(async () => {
    try {
      const response = await api.get("/payroll/month-hours", { params: { year, month } });
      setHours({ totals: response.data?.totals ?? null, shifts: response.data?.shifts ?? [], matched: response.data?.matched !== false, planned: response.data?.planned !== false });
    } catch { /* keep the last values */ }
  }, [year, month]);
  useEffect(() => {
    if (phase !== "ready") return;
    void loadHours();
    const timer = window.setInterval(() => void loadHours(), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void loadHours(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [phase, loadHours]);

  const result = useMemo(() => {
    if (!profile) return null;
    const totals = hours.totals;
    return calculateMonth(profile, { nightHours: totals?.nightHours ?? 0, sundayHours: totals?.sundayHours ?? 0, holidayHours: totals?.holidayHours ?? 0 }, year);
  }, [profile, hours.totals, year]);

  /* ---- actions ---- */
  const persist = async (next: PayrollProfile, key: CryptoKey, salt: Uint8Array) => {
    const encrypted = await encryptProfile(next, key, salt, KDF_ITERATIONS);
    await api.put("/payroll/profile", { salt: encrypted.salt, iv: encrypted.iv, ciphertext: encrypted.ciphertext, kdfIterations: encrypted.kdfIterations });
    setStored(encrypted);
  };

  const createPassword = async () => {
    setError("");
    if (password.length < 10) return setError("Das Passwort braucht mindestens 10 Zeichen.");
    if (password !== passwordRepeat) return setError("Die beiden Passwörter stimmen nicht überein.");
    setBusy(true);
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      keyRef.current = await deriveKey(password, salt);
      saltRef.current = salt;
      setPassword(""); setPasswordRepeat("");
      setPhase("setup");
    } catch { setError("Die Verschlüsselung steht in diesem Browser nicht zur Verfügung."); }
    finally { setBusy(false); }
  };

  const unlock = async () => {
    setError("");
    if (!stored) return;
    setBusy(true);
    try {
      const key = await deriveKey(password, fromBase64(stored.salt), stored.kdfIterations);
      const decrypted = await decryptProfile(stored, key);
      keyRef.current = key;
      await rememberKeyForTab(key);
      setProfile(decrypted);
      setPassword("");
      setPhase("ready");
    } catch { setError("Falsches Passwort."); }
    finally { setBusy(false); }
  };

  const save = async (next: PayrollProfile) => {
    if (!keyRef.current || !saltRef.current) return;
    setBusy(true);
    setError("");
    try {
      await persist(next, keyRef.current, saltRef.current);
      await rememberKeyForTab(keyRef.current);
      setProfile(next);
      setPhase("ready");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "Das Profil konnte nicht gespeichert werden.");
    } finally { setBusy(false); }
  };

  const lock = () => { forgetKeyForTab(); keyRef.current = null; setProfile(null); setPassword(""); setPhase("locked"); };

  const resetProfile = async () => {
    if (!window.confirm("Dein verschlüsseltes Abrechnungsprofil wird gelöscht. Du kannst danach neu beginnen. Fortfahren?")) return;
    try {
      await api.delete("/payroll/profile");
      forgetKeyForTab();
      keyRef.current = null; saltRef.current = null; setStored(null); setProfile(null); setPassword(""); setPasswordRepeat("");
      setPhase("create-password");
    } catch { setError("Das Profil konnte nicht gelöscht werden."); }
  };

  const shiftMonth = (delta: number) => {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  };

  const shell = "mx-auto w-full max-w-6xl space-y-5 px-4 py-5 lg:px-6";
  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400/30 to-blue-500/30 text-emerald-200"><Wallet className="h-5 w-5" /></span>
      <div>
        <h1 className="text-xl font-bold text-white">Abrechnung</h1>
        <p className="text-xs text-slate-400">Dein voraussichtliches Gehalt, live aus deinem Dienstplan</p>
      </div>
    </div>
  );

  if (phase === "loading") return <div className={shell}>{header}<div className="py-16 text-center text-sm text-slate-400">Lade …</div></div>;
  if (phase === "unavailable") return <div className={shell}>{header}<div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div></div>;

  if (phase === "create-password" || phase === "locked") {
    const creating = phase === "create-password";
    return (
      <div className={shell}>
        {header}
        <div className="mx-auto max-w-xl space-y-4 rounded-3xl border border-white/10 bg-white/[0.05] p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-slate-100">{creating ? <Lock className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}</span>
            <h2 className="text-lg font-bold text-white">{creating ? "Abrechnungs-Passwort festlegen" : "Abrechnung entsperren"}</h2>
          </div>
          <PrivacyNote />
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{creating ? "Neues Passwort (mind. 10 Zeichen)" : "Abrechnungs-Passwort"}</span>
            <input type="password" autoComplete={creating ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void (creating ? createPassword() : unlock()); }} className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-slate-100" />
          </label>
          {creating ? (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Passwort wiederholen</span>
              <input type="password" autoComplete="new-password" value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-slate-100" />
            </label>
          ) : null}
          {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {!creating ? <button type="button" onClick={() => void resetProfile()} className="text-xs text-slate-400 underline-offset-2 hover:text-red-300 hover:underline">Passwort vergessen? Profil löschen und neu anlegen</button> : <span />}
            <button type="button" disabled={busy || password.length === 0} onClick={() => void (creating ? createPassword() : unlock())} className="h-11 rounded-xl bg-gradient-to-b from-blue-400 to-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-900/40 disabled:opacity-50">{busy ? "Bitte warten …" : creating ? "Weiter" : "Entsperren"}</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "setup" || phase === "edit") {
    return (
      <div className={shell}>
        {header}
        <PrivacyNote />
        {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
        <PayrollProfileForm initial={phase === "edit" ? profile : null} saving={busy} onSave={(next) => void save(next)} onCancel={phase === "edit" ? () => setPhase("ready") : undefined} />
        <Disclaimer />
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.05]">
            <button type="button" aria-label="Vormonat" onClick={() => shiftMonth(-1)} className="grid h-10 w-10 place-items-center text-slate-300 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-36 text-center text-sm font-bold text-white">{MONTHS[month - 1]} {year}</span>
            <button type="button" aria-label="Folgemonat" onClick={() => shiftMonth(1)} className="grid h-10 w-10 place-items-center text-slate-300 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <button type="button" onClick={() => setPhase("edit")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-100 hover:bg-white/10"><Pencil className="h-4 w-4" />Daten bearbeiten</button>
          <button type="button" onClick={lock} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-100 hover:bg-white/10"><Lock className="h-4 w-4" />Sperren</button>
          <button type="button" onClick={() => void resetProfile()} aria-label="Profil löschen" title="Profil löschen" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {result ? <PayrollStatement result={result} totals={hours.totals} shifts={hours.shifts} monthLabel={`${MONTHS[month - 1]} ${year}`} matched={hours.matched} planned={hours.planned} /> : null}
      <Disclaimer />
      <PrivacyNote />
    </div>
  );
}
