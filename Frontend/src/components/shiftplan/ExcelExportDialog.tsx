import { useEffect, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { loadExcelInclude, saveExcelInclude, type ExcelExportInclude } from '../../api/planningPeriods';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

interface Props {
  open: boolean;
  /** What is exported, e.g. "März 2027" or "Quartalsplanung Q1 2027". */
  subject?: string;
  busy?: boolean;
  onConfirm: (include: ExcelExportInclude) => void;
  onCancel: () => void;
}

/** Asks the admin which data is visible in the management Excel before it is created. */
export function ExcelExportDialog({ open, subject, busy = false, onConfirm, onCancel }: Props) {
  const { language } = useLanguage();
  const de = language === 'de';
  const [include, setInclude] = useState<ExcelExportInclude>(loadExcelInclude);

  useEffect(() => {
    if (open) setInclude(loadExcelInclude());
  }, [open]);

  const options: Array<{ key: keyof ExcelExportInclude; title: string; hint: string }> = [
    {
      key: 'hours',
      title: de ? 'Soll- und Ist-Stunden' : 'Target and actual hours',
      hint: de ? 'Soll, Ist, Differenz und „Soll erreicht“ je Mitarbeiter und Monat; Stundenspalte im Monatsblatt.' : 'Target, actual, difference and share reached per employee and month; hours column on the month sheet.',
    },
    {
      key: 'wishes',
      title: de ? 'Wünsche (Erfüllung und Details)' : 'Wishes (fulfilment and details)',
      hint: de ? 'Wunscherfüllung in % und ein Blatt „Wunschdetails“ mit jedem einzelnen Wunsch, inklusive Urlaubswünschen.' : 'Fulfilment in % and a sheet with every single wish, including vacation wishes.',
    },
    {
      key: 'wishStatus',
      title: de ? 'Wünsche abgegeben (ja/nein)' : 'Wishes submitted (yes/no)',
      hint: de ? 'Zeigt, wer Wünsche abgegeben hat. Personen ohne Wünsche werden in allen Blättern gelb hervorgehoben.' : 'Shows who submitted wishes. Employees without wishes are highlighted in yellow on every sheet.',
    },
  ];
  const nothingChosen = !include.hours && !include.wishes && !include.wishStatus;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />{de ? 'Excel für die Leitung' : 'Excel for management'}</DialogTitle>
          <DialogDescription>
            {subject ? `${subject}: ` : ''}{de ? 'Welche Daten sollen in der Excel sichtbar sein?' : 'Which data should be visible in the Excel?'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {options.map((option) => (
            <label key={option.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/40 p-3 text-sm hover:bg-muted/30">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={include[option.key]}
                onChange={(event) => setInclude((current) => ({ ...current, [option.key]: event.target.checked }))}
              />
              <span>
                <span className="block font-semibold text-foreground">{option.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
          {nothingChosen ? (
            <p className="text-xs text-amber-300">{de ? 'Bitte mindestens eine Auswahl treffen. Für einen reinen Schichtplan nutze „Excel fürs Team“.' : 'Choose at least one item. For a plain shift plan use “Excel for the team”.'}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button
            type="button"
            disabled={busy || nothingChosen}
            onClick={() => { saveExcelInclude(include); onConfirm(include); }}
          >
            {busy ? (de ? 'Excel wird erstellt …' : 'Creating Excel …') : (de ? 'Excel erstellen' : 'Create Excel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
