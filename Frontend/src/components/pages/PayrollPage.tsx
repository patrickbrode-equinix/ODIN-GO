/* ------------------------------------------------ */
/* Payroll ("Abrechnung") – personal, end-to-end     */
/* encrypted estimate of the monthly pay slip.       */
/* ------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileText, Lock, LockKeyhole, ShieldCheck, Trash2, UserRound, Wallet } from "lucide-react";
import { api } from "../../api/api";
import { PayrollProfileForm } from "../payroll/PayrollProfileForm";
import { PayrollStatement, type MonthShift, type MonthTotals } from "../payroll/PayrollStatement";
import { PayrollYearChart, type YearChartPoint } from "../payroll/PayrollYearChart";
import { DEFAULT_PROFILE, calculateMonth, type PayrollProfile } from "../../utils/payrollEngine";
import {
  decryptProfile, deriveKey, encryptProfile, forgetKeyForTab, fromBase64, KDF_ITERATIONS, rememberKeyForTab, restoreKeyForTab, type EncryptedProfile,
} from "../../utils/payrollCrypto";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const REFRESH_MS = 60_000;

type Phase = "loading" | "unavailable" | "create-password" | "locked" | "ready";
type Tab = "data" | "statement";

const Disclaimer = ({ state }: { state: PayrollProfile["state"] }) => (
  <div role="note" className="flex gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-100">
    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
    <p>
      <b>Wichtiger Hinweis: Das ist eine Näherung und keine 100-prozentige Aussage.</b> Die Abrechnung ist keine Gehaltsabrechnung. Sie rechnet vereinfacht
      mit den Werten für {state === "BY" ? "Bayern (Kirchensteuer 8 %)" : "Hessen (Kirchensteuer 9 %)"}, dem Einkommensteuertarif und der Sozialversicherung 2026.
      Zuschläge: Feiertage 100 % (24.12. und 31.12. nur der halbe Tag), Sonntage 40 % je Stunde ganztägig, Spät/Nacht 25 % je Stunde ab 20 Uhr, alle steuerfrei.
      Abweichungen durch individuelle Merkmale, Einmalzahlungen, Besonderheiten der Steuerklassen 5 und 6 oder spätere Gesetzesänderungen sind möglich.
      Verbindlich ist allein die Abrechnung der Entgeltabrechnung des Arbeitgebers.
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
  const [tab, setTab] = useState<Tab>("data");
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [monthsLoaded, setMonthsLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
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
            setProfile({ ...DEFAULT_PROFILE, ...decrypted });
            setTab("statement");
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
      const response = await api.get("/payroll/month-hours", { params: { year, month, state: profile?.state ?? "HE" } });
      setHours({ totals: response.data?.totals ?? null, shifts: response.data?.shifts ?? [], matched: response.data?.matched !== false, planned: response.data?.planned !== false });
    } catch { /* keep the last values */ }
  }, [year, month, profile?.state]);
  useEffect(() => {
    if (phase !== "ready" || !profile || tab !== "statement") return;
    void loadHours();
    const timer = window.setInterval(() => void loadHours(), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void loadHours(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [phase, profile, tab, loadHours]);

  /* ---- months that have a plan for this person ---- */
  useEffect(() => {
    if (phase !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get("/payroll/months");
        if (cancelled) return;
        const months: string[] = Array.isArray(response.data?.months) ? response.data.months : [];
        setAvailableMonths(months);
        const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const pick = months.includes(current) ? current : (months.find((id) => id <= current) ?? months[0]);
        if (pick) { setYear(Number(pick.slice(0, 4))); setMonth(Number(pick.slice(5, 7))); }
      } catch { /* the selection stays empty */ } finally { if (!cancelled) setMonthsLoaded(true); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ---- year chart: plan hours of all planned months of the year, salary computed here from the own profile ---- */
  const [yearHours, setYearHours] = useState<Array<{ month: number; totals: MonthTotals }>>([]);
  const [yearLoading, setYearLoading] = useState(false);
  useEffect(() => {
    if (phase !== "ready" || !profile || tab !== "statement") return undefined;
    let cancelled = false;
    setYearLoading(true);
    api.get("/payroll/year-hours", { params: { year, state: profile.state } })
      .then((response) => { if (!cancelled) setYearHours(Array.isArray(response.data?.months) ? response.data.months : []); })
      .catch(() => { if (!cancelled) setYearHours([]); })
      .finally(() => { if (!cancelled) setYearLoading(false); });
    return () => { cancelled = true; };
  }, [phase, profile, tab, year, hours.totals]);
  const yearPoints = useMemo<YearChartPoint[]>(() => {
    if (!profile) return [];
    return yearHours.map((entry) => {
      const calculated = calculateMonth(profile, { nightHours: entry.totals?.nightHours ?? 0, sundayHours: entry.totals?.sundayHours ?? 0, holidayHours: entry.totals?.holidayHours ?? 0 }, year);
      return { month: entry.month, net: calculated.netPay, gross: calculated.grossTotal };
    });
  }, [profile, yearHours, year]);

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
      await rememberKeyForTab(keyRef.current);
      setProfile(null);
      setTab("data");
      setPhase("ready");
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
      setProfile({ ...DEFAULT_PROFILE, ...decrypted });
      setPassword("");
      setTab("statement");
      setPhase("ready");
    } catch { setError("Falsches Passwort."); }
    finally { setBusy(false); }
  };

  const save = async (next: PayrollProfile) => {
    if (!keyRef.current || !saltRef.current) return;
    setBusy(true);
    setSaveError("");
    try {
      await persist(next, keyRef.current, saltRef.current);
      await rememberKeyForTab(keyRef.current);
      setProfile(next);
      setTab("statement");
    } catch (requestError: any) {
      const status = requestError?.response?.status;
      setSaveError(requestError?.response?.data?.message
        || (status === 403 ? "Die Abrechnung ist nur mit dem persönlichen Jarvis-Login verfügbar." : status ? `Das Profil konnte nicht gespeichert werden (Serverfehler ${status}). Bitte melde das der Administration.` : "Das Profil konnte nicht gespeichert werden (keine Verbindung zum Server)."));
    } finally { setBusy(false); }
  };

  const lock = () => { forgetKeyForTab(); keyRef.current = null; setProfile(null); setPassword(""); setTab("data"); setPhase(stored ? "locked" : "create-password"); };

  const resetProfile = async () => {
    if (!window.confirm("Dein verschlüsseltes Abrechnungsprofil wird gelöscht. Du kannst danach neu beginnen. Fortfahren?")) return;
    try {
      await api.delete("/payroll/profile");
      forgetKeyForTab();
      keyRef.current = null; saltRef.current = null; setStored(null); setProfile(null); setPassword(""); setPasswordRepeat("");
      setTab("data");
      setPhase("create-password");
    } catch { setError("Das Profil konnte nicht gelöscht werden."); }
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

  const monthId = `${year}-${String(month).padStart(2, "0")}`;
  const tabButton = (id: Tab, label: string, icon: React.ReactNode, disabled = false) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      disabled={disabled}
      onClick={() => setTab(id)}
      className={`inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold transition ${tab === id ? "bg-gradient-to-b from-blue-400 to-blue-600 text-white shadow-lg shadow-blue-900/40" : "border border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/10"} disabled:cursor-not-allowed disabled:opacity-40`}
    >{icon}{label}</button>
  );

  return (
    <div className={shell}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={lock} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-100 hover:bg-white/10"><Lock className="h-4 w-4" />Sperren</button>
          <button type="button" onClick={() => void resetProfile()} aria-label="Profil löschen" title="Profil löschen" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div role="tablist" aria-label="Abrechnung" className="flex flex-wrap gap-2">
        {tabButton("data", "Meine Daten", <UserRound className="h-4 w-4" />)}
        {tabButton("statement", "Abrechnung", <FileText className="h-4 w-4" />, !profile)}
      </div>
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}

      {tab === "data" || !profile ? (
        <div className="space-y-4">
          {!profile ? <div role="status" className="rounded-2xl border border-blue-400/30 bg-blue-500/10 p-4 text-sm text-blue-100">Dein Passwort ist festgelegt. Trage jetzt deine Daten ein (Jahresbrutto, Steuerklasse, Kinder, Bundesland, Abzüge und zusätzliche Einnahmen) und speichere sie ganz unten mit „Verschlüsselt speichern“. Danach siehst du deine Abrechnung.</div> : null}
          <PrivacyNote />
          <PayrollProfileForm key={profile ? "edit" : "new"} initial={profile} saving={busy} saveError={saveError} onSave={(next) => void save(next)} onCancel={profile ? () => setTab("statement") : undefined} />
        </div>
      ) : (
        <div className="space-y-5">
          <Disclaimer state={profile.state} />
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <label htmlFor="payroll-month" className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Monat</label>
            <select
              id="payroll-month"
              value={availableMonths.includes(monthId) ? monthId : ""}
              onChange={(event) => { const id = event.target.value; if (id) { setYear(Number(id.slice(0, 4))); setMonth(Number(id.slice(5, 7))); } }}
              disabled={availableMonths.length === 0}
              className="h-10 min-w-48 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-sm font-semibold text-slate-100"
            >
              {availableMonths.length === 0 ? <option value="">{monthsLoaded ? "Kein Monat verfügbar" : "Lade …"}</option> : null}
              {availableMonths.map((id) => <option key={id} value={id}>{MONTHS[Number(id.slice(5, 7)) - 1]} {id.slice(0, 4)}</option>)}
            </select>
            <span className="text-xs text-slate-400">{profile.state === "BY" ? "Bayern" : "Hessen"} · Monate, für die ein Dienstplan mit deinen Schichten vorliegt</span>
          </div>
          {monthsLoaded && availableMonths.length === 0 ? (
            <div role="status" className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Für dich liegt noch kein Dienstplan vor. Sobald Schichten für dich geplant sind, erscheint der Monat hier.</div>
          ) : result && availableMonths.includes(monthId) ? (
            <PayrollStatement result={result} totals={hours.totals} shifts={hours.shifts} monthLabel={`${MONTHS[month - 1]} ${year}`} matched={hours.matched} planned={hours.planned} state={profile.state} />
          ) : null}
          <PayrollYearChart year={year} points={yearPoints} selectedMonth={month} loading={yearLoading} onSelect={(picked) => { const id = `${year}-${String(picked).padStart(2, "0")}`; if (availableMonths.includes(id)) setMonth(picked); }} />
        </div>
      )}
    </div>
  );
}
