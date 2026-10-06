/* ================================================ */
/* Vacation wishes – self-service                   */
/* Employees enter, change and delete their own     */
/* vacation. The generator never schedules them in  */
/* these periods and the plan shows them as absent. */
/* ================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { de as deLocale, enGB } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/api';
import { EnterpriseCard } from '../layout/EnterpriseLayout';
import { useLanguage, getLanguageLocale } from '../../context/LanguageContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Calendar } from '../ui/calendar';

interface VacationEntry {
  id: number;
  start_date: string;
  end_date: string;
  note: string | null;
  editable: boolean;
}

interface VacationAccount {
  entries: VacationEntry[];
  allowance: number;
  used: number;
  remaining: number;
}

const toKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const fromKey = (key: string) => new Date(`${key.slice(0, 10)}T12:00:00`);

function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.error || fallback;
}

export function VacationWishes() {
  const { language } = useLanguage();
  const isGerman = language === 'de';
  const locale = getLanguageLocale(language);
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear);
  const [account, setAccount] = useState<VacationAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ entry: VacationEntry | null } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/shift-config/vacation-wishes', { params: { year } });
      setAccount({ entries: data.entries || [], allowance: data.allowance, used: data.used, remaining: data.remaining });
    } catch (e: any) {
      setError(errorMessage(e, isGerman ? 'Urlaub konnte nicht geladen werden.' : 'Unable to load vacation.'));
    } finally {
      setLoading(false);
    }
  }, [year, isGerman]);

  useEffect(() => { void load(); }, [load]);

  const formatDate = (key: string) => fromKey(key).toLocaleDateString(locale);

  async function remove(id: number) {
    setBusy(true);
    setError('');
    try {
      await api.delete(`/shift-config/vacation-wishes/${id}`);
      setConfirmDeleteId(null);
      await load();
    } catch (e: any) {
      setError(errorMessage(e, isGerman ? 'Urlaub konnte nicht gelöscht werden.' : 'Unable to delete vacation.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EnterpriseCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <CalendarDays className="h-4 w-4 text-amber-400" />
          {isGerman ? 'Urlaubswünsche' : 'Vacation wishes'}
        </h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isGerman ? 'Jahr' : 'Year'}
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="rounded-lg border border-border/30 bg-background/40 px-2 py-1 text-xs text-foreground"
            >
              {Array.from({ length: 5 }, (_, index) => currentYear - 1 + index).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <Button type="button" size="sm" onClick={() => setDialog({ entry: null })} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />{isGerman ? 'Urlaub eintragen' : 'Add vacation'}
          </Button>
        </div>
      </div>

      <p className="mb-3 text-[11px] leading-5 text-muted-foreground">
        {isGerman
          ? 'Trage hier deinen Urlaub ein. In diesem Zeitraum wirst du vom Dienstplan-Generator nicht eingeplant und im Dienstplan als abwesend (ABW) angezeigt. Einträge, die ein Administrator angelegt hat, kannst du sehen, aber nicht ändern.'
          : 'Enter your vacation here. During this period the shift generator will not schedule you and the plan shows you as absent (ABW). Entries created by an administrator are visible to you but cannot be changed.'}
      </p>

      {account && (
        <div className="mb-3 flex flex-wrap gap-4 text-xs" aria-live="polite">
          <span>{isGerman ? 'Kontingent' : 'Allowance'}: <strong>{account.allowance}</strong></span>
          <span>{isGerman ? 'Eingetragen' : 'Booked'}: <strong>{account.used}</strong></span>
          <span className={account.remaining < 0 ? 'text-red-500' : 'text-emerald-500'}>{isGerman ? 'Noch offen' : 'Remaining'}: <strong>{account.remaining}</strong></span>
        </div>
      )}

      {error && <p role="alert" className="mb-2 text-xs text-red-500">{error}</p>}
      {loading && <p className="text-xs text-muted-foreground">{isGerman ? 'Urlaub wird geladen…' : 'Loading vacation…'}</p>}
      {!loading && account && account.entries.length === 0 && (
        <p className="text-xs text-muted-foreground">{isGerman ? 'Für dieses Jahr ist kein Urlaub eingetragen.' : 'No vacation entered for this year.'}</p>
      )}

      <div className="space-y-2">
        {account?.entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/30 bg-background/40 px-3 py-2 text-sm">
            <div className="min-w-0">
              <strong>{formatDate(entry.start_date)} – {formatDate(entry.end_date)}</strong>
              {entry.note && <p className="break-words text-xs text-muted-foreground">{entry.note}</p>}
              {!entry.editable && <p className="text-[11px] text-muted-foreground">{isGerman ? 'Vom Administrator eingetragen' : 'Entered by an administrator'}</p>}
            </div>
            {entry.editable && (
              <div className="flex shrink-0 items-center gap-1">
                {confirmDeleteId === entry.id ? (
                  <>
                    <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void remove(entry.id)}>{isGerman ? 'Wirklich löschen' : 'Delete'}</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDeleteId(null)}>{isGerman ? 'Abbrechen' : 'Cancel'}</Button>
                  </>
                ) : (
                  <>
                    <Button type="button" size="icon" variant="ghost" aria-label={isGerman ? 'Urlaub ändern' : 'Edit vacation'} onClick={() => setDialog({ entry })}><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={isGerman ? 'Urlaub löschen' : 'Delete vacation'} onClick={() => setConfirmDeleteId(entry.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {dialog && (
        <VacationDialog
          entry={dialog.entry}
          initialYear={year}
          isGerman={isGerman}
          formatDate={formatDate}
          onClose={() => setDialog(null)}
          onSaved={async () => { setDialog(null); await load(); }}
        />
      )}
    </EnterpriseCard>
  );
}

interface DialogProps {
  entry: VacationEntry | null;
  initialYear: number;
  isGerman: boolean;
  formatDate: (key: string) => string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function VacationDialog({ entry, initialYear, isGerman, formatDate, onClose, onSaved }: DialogProps) {
  const today = new Date();
  const [month, setMonth] = useState<Date>(entry ? fromKey(entry.start_date) : new Date(initialYear, initialYear === today.getFullYear() ? today.getMonth() : 0, 1));
  const [range, setRange] = useState<DateRange | undefined>(entry ? { from: fromKey(entry.start_date), to: fromKey(entry.end_date) } : undefined);
  const [note, setNote] = useState(entry?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The calendar can be paged to any year, so the shown year must always be an option.
  const yearOptions = useMemo(() => {
    const base = today.getFullYear();
    const values = new Set<number>([base - 1, base, base + 1, base + 2, initialYear, month.getFullYear()]);
    if (entry) { values.add(fromKey(entry.start_date).getFullYear()); values.add(fromKey(entry.end_date).getFullYear()); }
    return [...values].sort((a, b) => a - b);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, initialYear, month]);

  const monthNames = useMemo(
    () => Array.from({ length: 12 }, (_, index) => new Date(2026, index, 1).toLocaleDateString(isGerman ? 'de-DE' : 'en-GB', { month: 'long' })),
    [isGerman],
  );
  const startKey = range?.from ? toKey(range.from) : '';
  const endKey = range?.from ? toKey(range.to ?? range.from) : '';

  const goMonth = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  async function save() {
    if (!startKey || !endKey) return;
    setBusy(true);
    setError('');
    try {
      const payload = { start_date: startKey, end_date: endKey, note };
      if (entry) await api.put(`/shift-config/vacation-wishes/${entry.id}`, payload);
      else await api.post('/shift-config/vacation-wishes', payload);
      await onSaved();
    } catch (e: any) {
      setError(errorMessage(e, isGerman ? 'Urlaub konnte nicht gespeichert werden.' : 'Unable to save vacation.'));
      setBusy(false);
    }
  }

  const selectClass = 'rounded-lg border border-border/40 bg-background/60 px-2 py-1.5 text-sm text-foreground';

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? (isGerman ? 'Urlaub ändern' : 'Edit vacation') : (isGerman ? 'Urlaub eintragen' : 'Add vacation')}</DialogTitle>
          <DialogDescription>
            {isGerman ? 'Klicke zuerst auf den ersten und dann auf den letzten Urlaubstag.' : 'Click the first and then the last day of your vacation.'}
          </DialogDescription>
        </DialogHeader>

        {/* Header: year and month */}
        <div className="flex items-center justify-between gap-2">
          <Button type="button" size="icon" variant="outline" aria-label={isGerman ? 'Vorheriger Monat' : 'Previous month'} onClick={() => goMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-2">
            <select aria-label={isGerman ? 'Jahr' : 'Year'} value={month.getFullYear()} className={selectClass}
              onChange={(event) => setMonth(new Date(Number(event.target.value), month.getMonth(), 1))}>
              {yearOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select aria-label={isGerman ? 'Monat' : 'Month'} value={month.getMonth()} className={selectClass}
              onChange={(event) => setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))}>
              {monthNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
            </select>
          </div>
          <Button type="button" size="icon" variant="outline" aria-label={isGerman ? 'Nächster Monat' : 'Next month'} onClick={() => goMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>

        <div className="flex justify-center">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            month={month}
            onMonthChange={setMonth}
            locale={isGerman ? deLocale : enGB}
            weekStartsOn={1}
            showOutsideDays={false}
            components={{ Caption: () => null }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border/30 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{isGerman ? 'Von' : 'From'}</div>
            <strong>{startKey ? formatDate(startKey) : '–'}</strong>
          </div>
          <div className="rounded-lg border border-border/30 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{isGerman ? 'Bis einschließlich' : 'Through'}</div>
            <strong>{endKey ? formatDate(endKey) : '–'}</strong>
          </div>
        </div>

        <label className="space-y-1 text-xs">
          <span>{isGerman ? 'Notiz (optional)' : 'Note (optional)'}</span>
          <Input maxLength={2000} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} />
        </label>

        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{isGerman ? 'Abbrechen' : 'Cancel'}</Button>
          <Button type="button" disabled={busy || !startKey} onClick={() => void save()}>
            {busy ? (isGerman ? 'Wird gespeichert…' : 'Saving…') : (isGerman ? 'Speichern' : 'Save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
