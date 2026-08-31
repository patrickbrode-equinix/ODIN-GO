/* ================================================ */
/* Ticket & Workload Preferences                    */
/* Soft preferences for assignment variety           */
/* ================================================ */

import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/api';
import { EnterpriseCard } from '../layout/EnterpriseLayout';
import { useLanguage } from '../../context/LanguageContext';
import {
  Ticket, Briefcase, GraduationCap, HelpCircle, Save,
  CheckCircle2, AlertTriangle, ShieldAlert,
} from 'lucide-react';

/* ---- Bilingual copy ---- */
const COPY = {
  de: {
    /* Ticket prefs */
    ticketPrefsTitle: 'Ticketpräferenzen',
    ticketPrefsBody: 'Wähle, welche Ticketkategorien du bevorzugst und welche du nach Möglichkeit vermeiden möchtest. Diese Auswahl ist ein weicher Wunsch und wird nur berücksichtigt, wenn mehrere gleichwertige Zuweisungsoptionen bestehen.',
    preferredCategory: 'Bevorzugte Ticketkategorie',
    secondaryCategory: 'Zweitpräferenz',
    avoidCategories: 'Kategorien nach Möglichkeit vermeiden',
    urgentTTWillingness: 'Bereitschaft für dringende Trouble Tickets',
    scheduledWorkWillingness: 'Bereitschaft für termingebundene Arbeiten',
    categorySwitchWillingness: 'Bereitschaft zum Kategoriewechsel innerhalb einer Schicht',
    preferGroupedWork: 'Bevorzugt: Gleiche System-/Bereichsarbeit gruppiert',
    preferVarietyDuringShift: 'Bevorzugt: Abwechslung während der Schicht',
    noneSelected: 'Keine Auswahl',

    /* Willingness levels */
    willingnessAlways: 'Immer',
    willingnessPreferred: 'Bevorzugt',
    willingnessNeutral: 'Neutral',
    willingnessAvoidIfPossible: 'Lieber vermeiden',
    willingnessNever: 'Nur im Notfall',

    /* Training */
    trainingTitle: 'Training & Entwicklung',
    trainingBody: 'Optionale Angaben zu deinem Erfahrungsstand und Interesse an Weiterentwicklung pro Ticketkategorie.',
    skillConfidence: 'Selbsteinschätzung',
    trainingInterest: 'Interesse an Weiterbildung',
    canMentor: 'Kann andere anleiten',
    needsMentoring: 'Wünscht sich Einarbeitung',
    confidenceBeginner: 'Einsteiger',
    confidenceBasic: 'Grundkenntnisse',
    confidenceIntermediate: 'Erfahren',
    confidenceAdvanced: 'Fortgeschritten',
    confidenceExpert: 'Experte',
    interestNone: 'Kein Interesse',
    interestLow: 'Gering',
    interestMedium: 'Mittel',
    interestHigh: 'Hoch',

    /* Override rule */
    overrideRuleTitle: 'Wichtige Fachregeln',
    overrideRuleBody: 'Ticketpräferenzen sind immer nachrangig gegenüber: Ticket-Priorität, Restzeit und Commit-Druck, erforderlichen Skills, Rollenrestriktionen, operativer Personalsituation und zwingender ODIN-Zuweisungslogik. Ein Mitarbeiter erhält zum Beispiel nicht ein bevorzugtes Cross-Connect-Ticket, wenn gleichzeitig ein kritisches Smart-Hands-Ticket mit hoher operativer Priorität vorliegt.',

    /* Workload extras */
    workloadExtrasTitle: 'Arbeitsbelastung & Flexibilität',
    workloadExtrasBody: 'Erweiterte Angaben zu Überstundenbereitschaft, kurzfristiger Vertretung und Schichtstabilität.',
    preferredWeeklyWorkload: 'Bevorzugte Wochenarbeitszeit',
    overtimeWillingness: 'Überstundenbereitschaft',
    lastMinuteWillingness: 'Bereitschaft für kurzfristige Schichtänderungen',
    absenceCoverWillingness: 'Bereitschaft für kurzfristige Vertretung',
    preferredIntensity: 'Bevorzugte Arbeitsintensität',
    stabilityVsVariety: 'Stabilität vs. Abwechslung',
    intensityLow: 'Niedrig',
    intensityNormal: 'Normal',
    intensityHigh: 'Hoch',
    stabilityStable: 'Lieber stabile Routine',
    stabilityBalanced: 'Ausgewogen',
    stabilityVariety: 'Lieber Abwechslung',
    hoursDefault: 'Vertragsstunden',
    hoursReduced: 'Reduziert',
    hoursExtended: 'Erweitert',

    /* Common */
    saved: 'Ticketpräferenzen gespeichert',
    saveFailed: 'Fehler beim Speichern',
    saving: 'Wird gespeichert…',
    saveButton: 'Präferenzen speichern',
  },
  en: {
    ticketPrefsTitle: 'Ticket preferences',
    ticketPrefsBody: 'Choose which ticket categories you prefer and which you would like to avoid if possible. This selection is a soft preference and is only considered when multiple equally valid assignment options exist.',
    preferredCategory: 'Preferred ticket category',
    secondaryCategory: 'Secondary preference',
    avoidCategories: 'Categories to avoid if possible',
    urgentTTWillingness: 'Willingness to handle urgent trouble tickets',
    scheduledWorkWillingness: 'Willingness to handle customer-scheduled work',
    categorySwitchWillingness: 'Willingness to switch categories during one shift',
    preferGroupedWork: 'Prefer: grouped work on same system/area',
    preferVarietyDuringShift: 'Prefer: variety during the shift',
    noneSelected: 'No selection',

    willingnessAlways: 'Always',
    willingnessPreferred: 'Preferred',
    willingnessNeutral: 'Neutral',
    willingnessAvoidIfPossible: 'Avoid if possible',
    willingnessNever: 'Only in emergencies',

    trainingTitle: 'Training & growth',
    trainingBody: 'Optional information about your experience level and interest in further development per ticket category.',
    skillConfidence: 'Self-assessment',
    trainingInterest: 'Training interest',
    canMentor: 'Can mentor others',
    needsMentoring: 'Needs mentoring',
    confidenceBeginner: 'Beginner',
    confidenceBasic: 'Basic',
    confidenceIntermediate: 'Intermediate',
    confidenceAdvanced: 'Advanced',
    confidenceExpert: 'Expert',
    interestNone: 'None',
    interestLow: 'Low',
    interestMedium: 'Medium',
    interestHigh: 'High',

    overrideRuleTitle: 'Important operational rules',
    overrideRuleBody: 'Ticket preferences are always subordinate to: ticket priority, remaining time and commit pressure, required skills, role restrictions, operational staffing situation, and mandatory ODIN assignment logic. For example, an employee will not receive a preferred cross-connect ticket if a critical smart-hands ticket with high operational priority is pending at the same time.',

    workloadExtrasTitle: 'Workload & flexibility',
    workloadExtrasBody: 'Extended information about overtime willingness, short-notice cover, and shift stability preferences.',
    preferredWeeklyWorkload: 'Preferred weekly workload',
    overtimeWillingness: 'Overtime willingness',
    lastMinuteWillingness: 'Willingness for last-minute shift changes',
    absenceCoverWillingness: 'Willingness to cover short-notice absences',
    preferredIntensity: 'Preferred work intensity',
    stabilityVsVariety: 'Stability vs. variety',
    intensityLow: 'Low',
    intensityNormal: 'Normal',
    intensityHigh: 'High',
    stabilityStable: 'Prefer stable routine',
    stabilityBalanced: 'Balanced',
    stabilityVariety: 'Prefer variety',
    hoursDefault: 'Contract hours',
    hoursReduced: 'Reduced',
    hoursExtended: 'Extended',

    saved: 'Ticket preferences saved',
    saveFailed: 'Failed to save',
    saving: 'Saving…',
    saveButton: 'Save preferences',
  },
} as const;

const TICKET_CATEGORIES = [
  { value: 'smart_hands', de: 'Smart Hands', en: 'Smart Hands' },
  { value: 'cross_connect', de: 'Cross Connect', en: 'Cross Connect' },
  { value: 'trouble_ticket', de: 'Trouble Ticket', en: 'Trouble Ticket' },
  { value: 'deinstall', de: 'Deinstall', en: 'Deinstall' },
  { value: 'scheduled', de: 'Termingebundene Arbeit', en: 'Scheduled / timed work' },
  { value: 'flexible', de: 'Flexibel / keine Präferenz', en: 'Flexible / no preference' },
] as const;

type WillingnessLevel = 'always' | 'preferred' | 'neutral' | 'avoid' | 'never';
type ConfidenceLevel = 'beginner' | 'basic' | 'intermediate' | 'advanced' | 'expert';
type InterestLevel = 'none' | 'low' | 'medium' | 'high';

interface TicketPrefs {
  preferred_category: string;
  secondary_category: string;
  avoid_categories: string[];
  urgent_tt_willingness: WillingnessLevel;
  scheduled_work_willingness: WillingnessLevel;
  category_switch_willingness: WillingnessLevel;
  prefer_grouped_work: boolean;
  prefer_variety_during_shift: boolean;
  skill_confidence: Record<string, ConfidenceLevel>;
  training_interest: Record<string, InterestLevel>;
  can_mentor: string[];
  needs_mentoring: string[];
  weekly_workload: 'default' | 'reduced' | 'extended';
  overtime_willingness: WillingnessLevel;
  last_minute_willingness: WillingnessLevel;
  absence_cover_willingness: WillingnessLevel;
  preferred_intensity: 'low' | 'normal' | 'high';
  stability_vs_variety: 'stable' | 'balanced' | 'variety';
}

const DEFAULTS: TicketPrefs = {
  preferred_category: '',
  secondary_category: '',
  avoid_categories: [],
  urgent_tt_willingness: 'neutral',
  scheduled_work_willingness: 'neutral',
  category_switch_willingness: 'neutral',
  prefer_grouped_work: false,
  prefer_variety_during_shift: false,
  skill_confidence: {},
  training_interest: {},
  can_mentor: [],
  needs_mentoring: [],
  weekly_workload: 'default',
  overtime_willingness: 'neutral',
  last_minute_willingness: 'neutral',
  absence_cover_willingness: 'neutral',
  preferred_intensity: 'normal',
  stability_vs_variety: 'balanced',
};

function HelpTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex ml-1">
      <button type="button" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        className="text-muted-foreground hover:text-blue-400 transition">
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {show && (
        <div className="absolute left-6 top-0 z-50 w-64 p-2.5 text-xs leading-relaxed rounded-lg border border-blue-500/30 bg-[#0a0f1e]/95 text-muted-foreground shadow-xl">
          {text}
        </div>
      )}
    </span>
  );
}

function WillingnessSelect({ value, onChange, copy }: {
  value: WillingnessLevel;
  onChange: (v: WillingnessLevel) => void;
  copy: Record<string, string>;
}) {
  const options: { value: WillingnessLevel; label: string }[] = [
    { value: 'always', label: copy.willingnessAlways },
    { value: 'preferred', label: copy.willingnessPreferred },
    { value: 'neutral', label: copy.willingnessNeutral },
    { value: 'avoid', label: copy.willingnessAvoidIfPossible },
    { value: 'never', label: copy.willingnessNever },
  ];
  return (
    <select value={value} onChange={e => onChange(e.target.value as WillingnessLevel)}
      className="w-full px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function TicketPreferences() {
  const { language } = useLanguage();
  const copy = COPY[language as keyof typeof COPY] || COPY.en;
  const isGerman = language === 'de';
  const [prefs, setPrefs] = useState<TicketPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/shift-config/ticket-preferences');
      if (res.data.preferences) {
        setPrefs({ ...DEFAULTS, ...res.data.preferences });
      }
    } catch {
      /* first use – no data yet */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/shift-config/ticket-preferences', prefs);
      showToast(copy.saved);
      setDirty(false);
    } catch (e: any) {
      showToast(e?.response?.data?.error || copy.saveFailed, 'err');
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof TicketPrefs>(field: K, value: TicketPrefs[K]) => {
    setPrefs(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const toggleInArray = (field: 'avoid_categories' | 'can_mentor' | 'needs_mentoring', value: string) => {
    setPrefs(prev => {
      const arr = (prev[field] as string[]) || [];
      const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, [field]: next };
    });
    setDirty(true);
  };

  const catLabel = (cat: typeof TICKET_CATEGORIES[number]) => isGerman ? cat.de : cat.en;

  if (loading) return <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" /></div>;

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${toast.type === 'ok' ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Override Rule Warning */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <div className="text-xs font-bold text-amber-300">{copy.overrideRuleTitle}</div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">{copy.overrideRuleBody}</p>
        </div>
      </div>

      {/* Ticket Category Preferences */}
      <EnterpriseCard>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-1">
          <Ticket className="w-4 h-4 text-blue-400" />
          {copy.ticketPrefsTitle}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">{copy.ticketPrefsBody}</p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">{copy.preferredCategory}</label>
            <select value={prefs.preferred_category} onChange={e => update('preferred_category', e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground">
              <option value="">{copy.noneSelected}</option>
              {TICKET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{catLabel(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{copy.secondaryCategory}</label>
            <select value={prefs.secondary_category} onChange={e => update('secondary_category', e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground">
              <option value="">{copy.noneSelected}</option>
              {TICKET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{catLabel(c)}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs text-muted-foreground">{copy.avoidCategories}</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {TICKET_CATEGORIES.map(c => (
              <button key={c.value} onClick={() => toggleInArray('avoid_categories', c.value)}
                className={`px-3 py-1.5 text-xs rounded-full border transition font-medium ${
                  prefs.avoid_categories.includes(c.value)
                    ? 'border-red-500/50 bg-red-500/15 text-red-400'
                    : 'border-border/30 bg-background/40 text-muted-foreground hover:border-red-500/30'
                }`}>
                {catLabel(c)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 mt-4 md:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">{copy.urgentTTWillingness}</label>
            <WillingnessSelect value={prefs.urgent_tt_willingness} onChange={v => update('urgent_tt_willingness', v)} copy={copy} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{copy.scheduledWorkWillingness}</label>
            <WillingnessSelect value={prefs.scheduled_work_willingness} onChange={v => update('scheduled_work_willingness', v)} copy={copy} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{copy.categorySwitchWillingness}</label>
            <WillingnessSelect value={prefs.category_switch_willingness} onChange={v => update('category_switch_willingness', v)} copy={copy} />
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mt-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={prefs.prefer_grouped_work} onChange={e => update('prefer_grouped_work', e.target.checked)}
              className="rounded h-4 w-4 border-border/40 bg-background/80 text-blue-500" />
            <span className="text-muted-foreground">{copy.preferGroupedWork}</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={prefs.prefer_variety_during_shift} onChange={e => update('prefer_variety_during_shift', e.target.checked)}
              className="rounded h-4 w-4 border-border/40 bg-background/80 text-blue-500" />
            <span className="text-muted-foreground">{copy.preferVarietyDuringShift}</span>
          </label>
        </div>
      </EnterpriseCard>

      {/* Workload & Flexibility */}
      <EnterpriseCard>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-1">
          <Briefcase className="w-4 h-4 text-emerald-400" />
          {copy.workloadExtrasTitle}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">{copy.workloadExtrasBody}</p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">{copy.preferredWeeklyWorkload}</label>
            <select value={prefs.weekly_workload} onChange={e => update('weekly_workload', e.target.value as any)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground">
              <option value="default">{copy.hoursDefault}</option>
              <option value="reduced">{copy.hoursReduced}</option>
              <option value="extended">{copy.hoursExtended}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{copy.overtimeWillingness}</label>
            <WillingnessSelect value={prefs.overtime_willingness} onChange={v => update('overtime_willingness', v)} copy={copy} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{copy.lastMinuteWillingness}</label>
            <WillingnessSelect value={prefs.last_minute_willingness} onChange={v => update('last_minute_willingness', v)} copy={copy} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{copy.absenceCoverWillingness}</label>
            <WillingnessSelect value={prefs.absence_cover_willingness} onChange={v => update('absence_cover_willingness', v)} copy={copy} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{copy.preferredIntensity}</label>
            <select value={prefs.preferred_intensity} onChange={e => update('preferred_intensity', e.target.value as any)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground">
              <option value="low">{copy.intensityLow}</option>
              <option value="normal">{copy.intensityNormal}</option>
              <option value="high">{copy.intensityHigh}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{copy.stabilityVsVariety}</label>
            <select value={prefs.stability_vs_variety} onChange={e => update('stability_vs_variety', e.target.value as any)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground">
              <option value="stable">{copy.stabilityStable}</option>
              <option value="balanced">{copy.stabilityBalanced}</option>
              <option value="variety">{copy.stabilityVariety}</option>
            </select>
          </div>
        </div>
      </EnterpriseCard>

      {/* Training & Growth */}
      <EnterpriseCard>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-1">
          <GraduationCap className="w-4 h-4 text-violet-400" />
          {copy.trainingTitle}
          <HelpTip text={copy.trainingBody} />
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th className="text-left py-2 pr-4 font-medium min-w-[120px]">&nbsp;</th>
                <th className="text-left py-2 pr-4 font-medium">{copy.skillConfidence}</th>
                <th className="text-left py-2 pr-4 font-medium">{copy.trainingInterest}</th>
                <th className="text-center py-2 pr-4 font-medium">{copy.canMentor}</th>
                <th className="text-center py-2 font-medium">{copy.needsMentoring}</th>
              </tr>
            </thead>
            <tbody>
              {TICKET_CATEGORIES.filter(c => c.value !== 'flexible').map(cat => (
                <tr key={cat.value} className="border-b border-border/10">
                  <td className="py-2 pr-4 font-medium text-foreground">{catLabel(cat)}</td>
                  <td className="py-2 pr-4">
                    <select
                      value={prefs.skill_confidence[cat.value] || 'intermediate'}
                      onChange={e => update('skill_confidence', { ...prefs.skill_confidence, [cat.value]: e.target.value as ConfidenceLevel })}
                      className="w-full px-2 py-1 text-xs rounded border border-border/30 bg-background/40 text-foreground">
                      <option value="beginner">{copy.confidenceBeginner}</option>
                      <option value="basic">{copy.confidenceBasic}</option>
                      <option value="intermediate">{copy.confidenceIntermediate}</option>
                      <option value="advanced">{copy.confidenceAdvanced}</option>
                      <option value="expert">{copy.confidenceExpert}</option>
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={prefs.training_interest[cat.value] || 'none'}
                      onChange={e => update('training_interest', { ...prefs.training_interest, [cat.value]: e.target.value as InterestLevel })}
                      className="w-full px-2 py-1 text-xs rounded border border-border/30 bg-background/40 text-foreground">
                      <option value="none">{copy.interestNone}</option>
                      <option value="low">{copy.interestLow}</option>
                      <option value="medium">{copy.interestMedium}</option>
                      <option value="high">{copy.interestHigh}</option>
                    </select>
                  </td>
                  <td className="py-2 pr-4 text-center">
                    <input type="checkbox" checked={prefs.can_mentor.includes(cat.value)}
                      onChange={() => toggleInArray('can_mentor', cat.value)}
                      className="h-4 w-4 rounded border-border/40 bg-background/80 text-violet-500" />
                  </td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={prefs.needs_mentoring.includes(cat.value)}
                      onChange={() => toggleInArray('needs_mentoring', cat.value)}
                      className="h-4 w-4 rounded border-border/40 bg-background/80 text-violet-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EnterpriseCard>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !dirty}
          className="flex items-center gap-1.5 text-sm px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 font-medium">
          <Save className="w-4 h-4" />
          {saving ? copy.saving : copy.saveButton}
        </button>
      </div>
    </div>
  );
}
