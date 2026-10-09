import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useLanguage, getLanguageLocale } from '../../context/LanguageContext';
import { addVacation, fetchAllVacations, fetchVacations, removeVacation, type VacationAccount } from '../../api/vacations';
import type { Absence } from '../../api/absences';

interface Props {
  userId: number;
  name: string;
  canEdit: boolean;
  onClose: () => void;
}

export function UserVacationDialog({ userId, name, canEdit, onClose }: Props) {
  const { language } = useLanguage();
  const de = language === 'de';
  const locale = getLanguageLocale(language);
  const [year, setYear] = useState(new Date().getFullYear());
  const [account, setAccount] = useState<VacationAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [allEntries, setAllEntries] = useState<Absence[]>([]);
  const initialYearApplied = useRef(false);

  // All entries (including wishes of the employee) from one year back. Opens the year of the
  // next upcoming vacation instead of an empty current year.
  useEffect(() => {
    let active = true;
    fetchAllVacations(userId).then((entries) => {
      if (!active) return;
      setAllEntries(entries);
      if (initialYearApplied.current) return;
      initialYearApplied.current = true;
      const today = new Date().toISOString().slice(0, 10);
      const next = entries.find((entry) => entry.end_date >= today);
      if (next) setYear(Number(next.start_date.slice(0, 4)) > new Date().getFullYear() ? Number(next.start_date.slice(0, 4)) : new Date().getFullYear());
    }).catch(() => { /* the calendar below still works */ });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAccount(null);
    setError('');
    setStart('');
    setEnd('');
    setRangeAnchor(null);
    fetchVacations(userId, year).then(data => { if (active) setAccount(data); })
      .catch(() => { if (active) setError(de ? 'Urlaub konnte nicht geladen werden.' : 'Unable to load vacation.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, year, de]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await addVacation(userId, start, end, note);
      setAccount(await fetchVacations(userId, year));
      setAllEntries(await fetchAllVacations(userId));
      setStart(''); setEnd(''); setNote(''); setRangeAnchor(null);
    } catch { setError(de ? 'Urlaub konnte nicht gespeichert werden.' : 'Unable to save vacation.'); }
    finally { setBusy(false); }
  }

  async function remove(id: number) {
    setBusy(true);
    setError('');
    try {
      await removeVacation(userId, id);
      setAccount(await fetchVacations(userId, year));
      setAllEntries(await fetchAllVacations(userId));
    } catch { setError(de ? 'Urlaub konnte nicht gelöscht werden.' : 'Unable to delete vacation.'); }
    finally { setBusy(false); }
  }

  function selectDay(key: string) {
    if (!rangeAnchor) { setStart(key); setEnd(key); setRangeAnchor(key); }
    else { setStart(key < rangeAnchor ? key : rangeAnchor); setEnd(key > rangeAnchor ? key : rangeAnchor); setRangeAnchor(null); }
  }

  const formatDate = (key: string) => new Date(`${key.slice(0, 10)}T12:00:00`).toLocaleDateString(locale);

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{de ? 'Urlaubstage' : 'Vacation days'} · {name}</DialogTitle>
        <DialogDescription>{de
          ? '30 Tage pro Jahr. Montag bis Freitag zählen zum Urlaubskonto. Der gesamte Zeitraum erscheint als Abwesend und wird nicht für Schichten eingeplant. Ein negativer Rest ist erlaubt.'
          : '30 days per year. Monday to Friday count towards the balance. The entire period appears as Absent and is excluded from shift assignments. A negative balance is allowed.'}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">{de ? 'Jahr' : 'Year'}
          <Input aria-label={de ? 'Jahr' : 'Year'} type="number" min={1900} max={9998} value={year} disabled={busy}
            className="w-28" onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1900 && value <= 9998) setYear(value); }} />
        </label>
        {account && <div className="flex flex-wrap gap-4 text-sm" aria-live="polite">
          <span>{de ? 'Kontingent' : 'Allowance'}: <strong>{account.allowance}</strong></span>
          <span>{de ? 'Eingetragen' : 'Booked'}: <strong>{account.used}</strong></span>
          <span className={account.remaining < 0 ? 'text-red-500' : 'text-emerald-500'}>{de ? 'Noch offen' : 'Remaining'}: <strong>{account.remaining}</strong></span>
        </div>}
      </div>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {allEntries.length > 0 && <section className="space-y-2 rounded-lg border p-3" aria-label={de ? 'Alle Urlaubseinträge' : 'All vacation entries'}>
        <h3 className="font-semibold text-sm">{de ? 'Alle Urlaubseinträge (inkl. Wünsche des Mitarbeiters)' : 'All vacation entries (incl. the employee\'s wishes)'}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {allEntries.map(entry => <button type="button" key={entry.id} onClick={() => setYear(Number(entry.start_date.slice(0, 4)))}
            className="flex items-start justify-between gap-3 rounded-lg border p-2 text-left text-sm hover:bg-muted/50">
            <span><strong>{formatDate(entry.start_date)} – {formatDate(entry.end_date)}</strong>{entry.note && <span className="block text-xs text-muted-foreground break-words">{entry.note}</span>}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${entry.source === 'self' ? 'bg-violet-500/20 text-violet-300' : 'bg-slate-500/20 text-slate-300'}`}>
              {entry.source === 'self' ? (de ? 'Wunsch Mitarbeiter' : 'Employee wish') : (de ? 'Eintrag Leitung' : 'Management entry')}
            </span>
          </button>)}
        </div>
      </section>}
      {loading && <p className="text-sm text-muted-foreground">{de ? 'Urlaub wird geladen…' : 'Loading vacation…'}</p>}
      {account && <>
        {canEdit && <form onSubmit={event => { event.preventDefault(); void save(); }} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_2fr_auto] items-end">
          <label className="text-xs space-y-1"><span>{de ? 'Von' : 'From'}</span><Input required type="date" value={start} disabled={busy} onChange={event => { setStart(event.target.value); setRangeAnchor(null); }} /></label>
          <label className="text-xs space-y-1"><span>{de ? 'Bis einschließlich' : 'Through'}</span><Input required type="date" min={start || undefined} value={end} disabled={busy} onChange={event => { setEnd(event.target.value); setRangeAnchor(null); }} /></label>
          <label className="text-xs space-y-1"><span>{de ? 'Notiz (optional)' : 'Note (optional)'}</span><Input maxLength={2000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label>
          <Button type="submit" disabled={busy || !start || !end || end < start}>{de ? 'Eintragen' : 'Add'}</Button>
          <p className="sm:col-span-4 text-xs text-muted-foreground">{de ? 'Im Kalender den ersten und letzten Tag anklicken oder einen Zeitraum eingeben. Überlappende Urlaubstage zählen nur einmal.' : 'Click the first and last day in the calendar or enter a date range. Overlapping vacation days count once.'}</p>
        </form>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, month) => {
            const offset = (new Date(year, month, 1).getDay() + 6) % 7;
            const days = new Date(year, month + 1, 0).getDate();
            return <section key={month} className="rounded-lg border p-3">
              <div className="flex justify-between text-sm mb-2"><h3 className="font-semibold">{new Date(year, month, 1).toLocaleDateString(locale, { month: 'long' })}</h3><span className="text-muted-foreground">{account.monthlyDays[month]} {de ? 'Tage' : 'days'}</span></div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {Array.from({ length: 7 }, (_, day) => <span key={`week-${day}`} className="text-muted-foreground">{new Date(2026, 0, 5 + day).toLocaleDateString(locale, { weekday: 'narrow' })}</span>)}
                {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
                {Array.from({ length: days }, (_, index) => {
                  const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
                  const booked = account.entries.some(entry => key >= entry.start_date && key <= entry.end_date);
                  const selected = start && end && key >= start && key <= end;
                  return <button type="button" key={key} disabled={!canEdit || busy} aria-label={formatDate(key)} aria-pressed={Boolean(selected)}
                    title={booked ? (de ? 'Urlaub · Abwesend' : 'Vacation · Absent') : formatDate(key)}
                    onClick={() => selectDay(key)} className={`h-7 rounded text-xs disabled:cursor-default ${selected ? 'bg-primary text-primary-foreground ring-2 ring-primary' : booked ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold' : 'hover:bg-muted'}`}>{index + 1}</button>;
                })}
              </div>
            </section>;
          })}
        </div>
        <section className="space-y-2">
          <h3 className="font-semibold text-sm">{de ? 'Urlaubseinträge' : 'Vacation entries'}</h3>
          {!account.entries.length && <p className="text-sm text-muted-foreground">{de ? 'Für dieses Jahr sind keine Urlaubstage eingetragen.' : 'No vacation booked for this year.'}</p>}
          {account.entries.map(entry => <div key={entry.id} className="flex justify-between items-center gap-3 rounded-lg border p-3 text-sm">
            <div><strong>{formatDate(entry.start_date)} – {formatDate(entry.end_date)}</strong> {entry.source === 'self' && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300">{de ? 'Wunsch Mitarbeiter' : 'Employee wish'}</span>}{entry.note && <p className="text-muted-foreground break-words">{entry.note}</p>}</div>
            {canEdit && <Button size="icon" variant="ghost" disabled={busy} aria-label={de ? 'Urlaubseintrag löschen' : 'Delete vacation entry'} onClick={() => void remove(entry.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
          </div>)}
        </section>
      </>}
    </DialogContent>
  </Dialog>;
}
