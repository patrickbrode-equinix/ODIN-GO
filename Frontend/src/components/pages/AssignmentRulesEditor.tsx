/* ------------------------------------------------ */
/* ASSIGNMENT RULES EDITOR                          */
/* Configurable ODIN logic tree / decision rules    */
/* ------------------------------------------------ */

import { useCallback, useEffect, useState, type ElementType, type ReactNode } from "react";
import { EnterprisePageShell, EnterpriseCard, EnterpriseFeatureHero, EnterpriseHeader } from "../layout/EnterpriseLayout";
import {
  fetchAssignmentRules, fetchAssignmentRule, updateAssignmentRule, toggleAssignmentRule, rollbackAssignmentRule,
  type AssignmentRule, type AssignmentRuleHistory
} from "../../api/assignmentRules";
import {
  Brain, ChevronDown, ChevronRight, ToggleLeft, ToggleRight,
  Save, Loader2, History, RotateCcw, Shield, Zap, BarChart3, AlertTriangle,
  ArrowUp, ArrowDown, SlidersHorizontal, Wrench
} from "lucide-react";
import { Switch } from "../ui/switch";
import { Slider } from "../ui/slider";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { InfoTooltip } from "../ui/InfoTooltip";
import { useLanguage } from "../../context/LanguageContext";

function getCategoryMeta(t: (key: any) => string, isGerman: boolean): Record<string, { label: string; icon: ElementType; color: string; help: ReactNode }> {
  return {
    priority: {
      label: t("rules.catPriorities"),
      icon: Zap,
      color: "text-orange-600",
      help: <p>{isGerman ? "Legt fest, in welcher Reihenfolge Ticketarten und Prioritätsstufen abgearbeitet werden. Diese Kategorie beeinflusst die Sortierung, bevor ein Worker ausgewählt wird." : "Defines the order in which ticket types and priority levels are processed. This category affects sorting before a worker is selected."}</p>,
    },
    role: {
      label: t("rules.catRoleRules"),
      icon: Shield,
      color: "text-blue-600",
      help: <p>{isGerman ? "Definiert, welche Rollen grundsätzlich zuweisbar sind und welche Sonderlogik für Dispatcher, Cross Connect oder Deutsche Börse gilt." : "Defines which roles are generally assignable and which special logic applies to Dispatcher, Cross Connect, or Deutsche Börse."}</p>,
    },
    load: {
      label: t("rules.catLoadBalancing"),
      icon: BarChart3,
      color: "text-green-600",
      help: <p>{isGerman ? "Steuert Caps, Gleichverteilung und ähnliche Restzeiten, damit ODIN Last nicht nur korrekt, sondern auch fair verteilt." : "Controls caps, balancing, and similar remaining times so ODIN distributes load not only correctly but also fairly."}</p>,
    },
    exception: {
      label: t("rules.catExceptions"),
      icon: AlertTriangle,
      color: "text-red-600",
      help: <p>{isGerman ? "Sammlung spezieller Sonderregeln, die nur in klar definierten Ausnahmefällen greifen sollen." : "Collection of special-case rules that should only apply in clearly defined exception scenarios."}</p>,
    },
  };
}

function getRoleOptions(t: (key: any) => string) {
  return [
    { value: "large_order", label: "Large Order" },
    { value: "project", label: "Project" },
    { value: "leads", label: "Leads" },
    { value: "dispatcher", label: "Dispatcher" },
    { value: "deutsche_boerse", label: "Deutsche Börse" },
    { value: "cross_connect", label: "Cross Connect" },
    { value: "kolo", label: "KOLO" },
    { value: "buddy", label: "Buddy" },
    { value: "neustarter", label: t("rules.newStarter") },
    { value: "support", label: "Support" },
    { value: "normal", label: t("rules.normalOperation") },
  ];
}

const TICKET_TYPE_OPTIONS = ["TroubleTicket", "SmartHands", "CrossConnect", "Scheduled", "Other"];

function getRuleHelp(isGerman: boolean): Record<string, ReactNode> {
  return {
    priority_tiers: <p>{isGerman ? "Bestimmt die globale Abarbeitungsreihenfolge. Höhere Tiers werden vollständig betrachtet, bevor spätere Tiers zum Zug kommen." : "Defines the global processing order. Higher tiers are fully considered before later tiers are evaluated."}</p>,
    excluded_roles: <p>{isGerman ? "Rollen in dieser Liste werden nie automatisch mit normalen Tickets versorgt. Das ist der zentrale Hebel für organisatorische Sonderrollen." : "Roles in this list are never assigned normal tickets automatically. This is the central lever for organizational special roles."}</p>,
    dispatcher_rule: <p>{isGerman ? "Reserviert Dispatcher für Handovers oder manuelle Sonderfälle. So landen operative Tickets nicht versehentlich beim Dispatcher." : "Reserves dispatchers for handovers or manual exceptions so operational tickets do not end up there by accident."}</p>,
    deutsche_boerse: <p>{isGerman ? "Beschränkt die Deutsche-Börse-Rolle auf passende Ticketarten und Restzeitfenster. Dadurch bleibt DB-Know-how für die richtigen Fälle frei." : "Restricts the Deutsche Börse role to matching ticket types and remaining-time windows so DB expertise stays available for the right cases."}</p>,
    cross_connect_only: <p>{isGerman ? "Regelt die Sortenreinheit für Cross-Connect-Rollen inklusive kontrollierter Ausnahmen bei Ressourcenknappheit." : "Controls queue purity for Cross Connect roles including controlled exceptions during resource shortages."}</p>,
    max_sh_per_system: <p>{isGerman ? "Verhindert, dass ein Worker zu viele Smart-Hands-Aufgaben auf demselben System gleichzeitig hält." : "Prevents one worker from holding too many Smart Hands tasks on the same system at the same time."}</p>,
    similar_time_threshold: <p>{isGerman ? "Diese Schwelle steuert, wann Restzeiten ähnlich genug sind, um Cross-Connect-Aufgaben zu bündeln." : "This threshold controls when remaining times are similar enough to bundle Cross Connect tasks."}</p>,
    load_balancing: <p>{isGerman ? "Definiert, ob ODIN primär nach geringster Last oder nach stabiler, auditierbarer Reihenfolge auswählt." : "Defines whether ODIN chooses primarily by lowest workload or by a stable, auditable order."}</p>,
    expedite_priority: <p>{isGerman ? "Hebt Expedite-Tickets innerhalb gleicher fachlicher Priorität vor, ohne die gesamte Prioritätsmatrix umzubauen." : "Promotes expedite tickets within the same business priority without rebuilding the entire priority matrix."}</p>,
    max_tickets_per_worker: <p>{isGerman ? "Setzt Gesamt- und Feingranular-Limits pro Worker, Rolle und Tickettyp. Diese Limits greifen bereits in der Eligibility-Prüfung und sind damit transparent erklärbar." : "Sets overall and fine-grained limits per worker, role, and ticket type. These limits already apply during eligibility checks and remain transparent to explain."}</p>,
  };
}

function renderHelpContent(help: ReactNode) {
  return typeof help === "string" ? <p>{help}</p> : help;
}

function LabelWithInfo({
  label,
  help,
  className = "text-sm font-medium",
  side = "right",
}: {
  label: string;
  help?: ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span>{label}</span>
      {help ? (
        <InfoTooltip title={label} side={side} align="start" width="w-96">
          {renderHelpContent(help)}
        </InfoTooltip>
      ) : null}
    </div>
  );
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function asNumberMap(value: unknown): Record<string, number> {
  const source = asObject(value);
  return Object.entries(source).reduce<Record<string, number>>((acc, [key, entry]) => {
    const parsed = Number(entry);
    if (Number.isFinite(parsed) && parsed >= 0) acc[key] = parsed;
    return acc;
  }, {});
}

function asNestedNumberMap(value: unknown): Record<string, Record<string, number>> {
  const source = asObject(value);
  return Object.entries(source).reduce<Record<string, Record<string, number>>>((acc, [key, entry]) => {
    acc[key] = asNumberMap(entry);
    return acc;
  }, {});
}

export default function AssignmentRulesEditor({ embedded = false }: { embedded?: boolean }) {
  const { language, t } = useLanguage();
  const isGerman = language === "de";
  const categoryMeta = getCategoryMeta(t, isGerman);
  const roleOptions = getRoleOptions(t);
  const ruleHelp = getRuleHelp(isGerman);
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<AssignmentRuleHistory[]>([]);
  const [editingConfig, setEditingConfig] = useState<Record<string, unknown>>({});
  const [editingJson, setEditingJson] = useState<string>("");
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdvancedByRule, setShowAdvancedByRule] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await fetchAssignmentRules());
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const applyConfigUpdate = useCallback((updater: (current: Record<string, unknown>) => Record<string, unknown>) => {
    const next = updater(editingConfig);
    setEditingConfig(next);
    setEditingJson(JSON.stringify(next, null, 2));
  }, [editingConfig]);

  const expandRule = async (ruleKey: string) => {
    if (expanded === ruleKey) {
      setExpanded(null);
      return;
    }

    setExpanded(ruleKey);
    try {
      const data = await fetchAssignmentRule(ruleKey);
      const config = asObject(data.rule.config_json);
      setHistory(data.history);
      setEditingConfig(config);
      setEditingJson(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error(error);
    }

    setChangeNote("");
    setShowHistory(false);
  };

  const toggle = async (ruleKey: string) => {
    try {
      const updated = await toggleAssignmentRule(ruleKey);
      setRules((prev) => prev.map((rule) => rule.rule_key === ruleKey ? updated : rule));
    } catch (error) {
      console.error(error);
    }
  };

  const saveRule = async (ruleKey: string) => {
    setSaving(true);
    try {
      let config: Record<string, unknown>;
      try {
        config = asObject(JSON.parse(editingJson));
      } catch {
        alert(isGerman ? "Ungültiges JSON in der erweiterten Konfiguration." : "Invalid JSON in the advanced configuration.");
        setSaving(false);
        return;
      }

      const updated = await updateAssignmentRule(ruleKey, { config_json: config, change_note: changeNote || undefined });
      setRules((prev) => prev.map((rule) => rule.rule_key === ruleKey ? updated : rule));

      const data = await fetchAssignmentRule(ruleKey);
      const refreshedConfig = asObject(data.rule.config_json);
      setHistory(data.history);
      setEditingConfig(refreshedConfig);
      setEditingJson(JSON.stringify(refreshedConfig, null, 2));
      setChangeNote("");
    } catch (error) {
      console.error(error);
    }
    setSaving(false);
  };

  const rollback = async (ruleKey: string, version: number) => {
    if (!confirm(isGerman ? `Rollback auf Version ${version}?` : `Rollback to version ${version}?`)) return;
    try {
      const updated = await rollbackAssignmentRule(ruleKey, version);
      setRules((prev) => prev.map((rule) => rule.rule_key === ruleKey ? updated : rule));
      const config = asObject(updated.config_json);
      setEditingConfig(config);
      setEditingJson(JSON.stringify(config, null, 2));
      const data = await fetchAssignmentRule(ruleKey);
      setHistory(data.history);
    } catch (error) {
      console.error(error);
    }
  };

  const toggleArrayValue = (key: string, value: string, checked: boolean) => {
    applyConfigUpdate((current) => {
      const nextValues = new Set(asArray(current[key]));
      if (checked) nextValues.add(value);
      else nextValues.delete(value);
      return { ...current, [key]: Array.from(nextValues) };
    });
  };

  const setNumberMapValue = (key: string, mapKey: string, rawValue: string) => {
    applyConfigUpdate((current) => {
      const currentMap = asNumberMap(current[key]);
      const nextMap = { ...currentMap };
      const parsed = Number(rawValue);
      if (!rawValue.trim() || !Number.isFinite(parsed) || parsed < 0) delete nextMap[mapKey];
      else nextMap[mapKey] = parsed;
      return { ...current, [key]: nextMap };
    });
  };

  const setNestedNumberMapValue = (key: string, outerKey: string, innerKey: string, rawValue: string) => {
    applyConfigUpdate((current) => {
      const currentMap = asNestedNumberMap(current[key]);
      const nextInner = { ...(currentMap[outerKey] || {}) };
      const parsed = Number(rawValue);
      if (!rawValue.trim() || !Number.isFinite(parsed) || parsed < 0) delete nextInner[innerKey];
      else nextInner[innerKey] = parsed;

      const nextMap = { ...currentMap };
      if (Object.keys(nextInner).length === 0) delete nextMap[outerKey];
      else nextMap[outerKey] = nextInner;
      return { ...current, [key]: nextMap };
    });
  };

  const renderNumberMapEditor = (title: string, description: string, ruleKey: string, options: { value: string; label: string }[], help?: ReactNode) => {
    const values = asNumberMap(editingConfig[ruleKey]);
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
        <div className="mb-2">
          <LabelWithInfo label={title} help={help || description} />
          <div className="text-xs text-gray-500">{description}</div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {options.map((option) => (
            <label key={option.value} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900/30">
              <div className="mb-1 font-medium">{option.label}</div>
              <Input
                type="number"
                min={0}
                value={values[option.value] ?? ""}
                onChange={(event) => setNumberMapValue(ruleKey, option.value, event.target.value)}
                placeholder={t("rules.emptyNoOverride")}
              />
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderNestedNumberMapEditor = (title: string, description: string, ruleKey: string, help?: ReactNode) => {
    const values = asNestedNumberMap(editingConfig[ruleKey]);
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
        <div className="mb-2">
          <LabelWithInfo label={title} help={help || description} />
          <div className="text-xs text-gray-500">{description}</div>
        </div>
        <div className="space-y-3">
          {roleOptions.map((role) => (
            <div key={role.value} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/30">
              <LabelWithInfo label={role.label} className="mb-2 text-sm font-medium" help={<p>{isGerman ? `Feingranulare Limits nur für die Rolle ${role.label}. Leere Felder bedeuten: kein abweichendes Sonderlimit.` : `Fine-grained limits only for the role ${role.label}. Empty fields mean no role-specific override.`}</p>} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {TICKET_TYPE_OPTIONS.map((ticketType) => (
                  <label key={`${role.value}-${ticketType}`} className="text-sm">
                    <LabelWithInfo label={ticketType} className="mb-1 text-xs text-gray-500" help={<p>{isGerman ? `Maximale Anzahl aktiver ${ticketType}-Tickets für Rolle ${role.label}. Leer bedeutet: kein spezielles Rollen-Typ-Limit.` : `Maximum number of active ${ticketType} tickets for role ${role.label}. Empty means no role-type-specific limit.`}</p>} />
                    <Input
                      type="number"
                      min={0}
                      value={values[role.value]?.[ticketType] ?? ""}
                      onChange={(event) => setNestedNumberMapValue(ruleKey, role.value, ticketType, event.target.value)}
                      placeholder={t("rules.emptyNoOverride")}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPriorityEditor = () => {
    const tiers = Array.isArray(editingConfig.tiers) ? [...editingConfig.tiers] : [];

    if (tiers.length === 0) {
      return <div className="text-sm text-gray-500">{t("rules.noTiersConfigured")}</div>;
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <SlidersHorizontal className="h-4 w-4" />
          {t("rules.adjustOrder")}
        </div>
        {tiers.map((tier, index) => {
          const tierConfig = asObject(tier);
          const types = asArray(tierConfig.types);
          const priorities = asArray(tierConfig.priorities);
          return (
            <div key={`${tierConfig.label || tierConfig.tier || index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <LabelWithInfo
                    label={String(tierConfig.label || `Tier ${index + 1}`)}
                    className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                    help={<p>{isGerman ? "Diese Stufe wird in genau dieser Reihenfolge gegen andere Prioritätsstufen bewertet. Mit den Pfeilen lässt sich die Reihenfolge ändern." : "This tier is evaluated against other tiers in exactly this order. Use the arrows to change the order."}</p>}
                  />
              <div className="mt-1 text-xs text-gray-500">{t("rules.types")}: {types.join(", ") || "—"}</div>
              <div className="text-xs text-gray-500">{t("rules.priorities")}: {priorities.join(", ") || t("rules.all")}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => applyConfigUpdate((current) => {
                      const nextTiers = moveItem(Array.isArray(current.tiers) ? current.tiers : [], index, index - 1)
                        .map((entry, nextIndex) => ({ ...asObject(entry), tier: nextIndex + 1 }));
                      return { ...current, tiers: nextTiers };
                    })}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-white disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === tiers.length - 1}
                    onClick={() => applyConfigUpdate((current) => {
                      const nextTiers = moveItem(Array.isArray(current.tiers) ? current.tiers : [], index, index + 1)
                        .map((entry, nextIndex) => ({ ...asObject(entry), tier: nextIndex + 1 }));
                      return { ...current, tiers: nextTiers };
                    })}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-white disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderConfigEditor = (rule: AssignmentRule) => {
    const config = editingConfig;

    switch (rule.rule_key) {
      case "priority_tiers":
        return renderPriorityEditor();

      case "excluded_roles":
        return (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {roleOptions.map((role) => (
              <label key={role.value} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800/40">
                <Checkbox
                  checked={asArray(config.roles).includes(role.value)}
                  onCheckedChange={(checked) => toggleArrayValue("roles", role.value, checked === true)}
                />
                <LabelWithInfo label={role.label} help={<p>{isGerman ? `Wenn aktiviert, wird die Rolle ${role.label} grundsätzlich aus der automatischen Ticketzuweisung ausgeschlossen.` : `If enabled, the role ${role.label} is generally excluded from automatic ticket assignment.`}</p>} className="text-sm" />
              </label>
            ))}
          </div>
        );

      case "dispatcher_rule":
        return (
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
            <div>
            <LabelWithInfo label={t("rules.onlyOtherTeamsHandovers")} help={<p>{isGerman ? "Wenn aktiv, erhält der Dispatcher keine normalen Auto-Assignments, sondern bleibt für Fremdteam-Übergaben und Eskalationen reserviert." : "If enabled, the dispatcher receives no normal auto-assignments and remains reserved for foreign-team handovers and escalations."}</p>} />
              <div className="text-xs text-gray-500">{isGerman ? "Dispatcher bleibt exklusiv für Eskalationen und Fremdteam-Übergaben reserviert." : "Dispatcher stays reserved exclusively for escalations and foreign-team handovers."}</div>
            </div>
            <Switch
              checked={asBoolean(config.only_other_teams_handovers, true)}
              onCheckedChange={(checked) => applyConfigUpdate((current) => ({ ...current, only_other_teams_handovers: checked }))}
            />
          </div>
        );

      case "deutsche_boerse":
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
              <div>
            <LabelWithInfo label={t("rules.allowTroubleTickets")} help={<p>{isGerman ? "Erlaubt Mitarbeitern mit Deutsche-Börse-Rolle, Trouble Tickets automatisch zu übernehmen." : "Allows employees with the Deutsche Börse role to take Trouble Tickets automatically."}</p>} />
                <div className="text-xs text-gray-500">{isGerman ? "DB-Mitarbeiter dürfen Trouble Tickets übernehmen." : "DB employees may take Trouble Tickets."}</div>
              </div>
              <Switch
                checked={asBoolean(config.allow_tt, true)}
                onCheckedChange={(checked) => applyConfigUpdate((current) => ({ ...current, allow_tt: checked }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
              <div>
            <LabelWithInfo label={t("rules.ccOnlyAbove24h")} help={<p>{isGerman ? "Blockiert zeitkritische Cross Connects für DB-Rollen und lässt nur Aufträge mit ausreichend Vorlauf zu." : "Blocks time-critical Cross Connects for DB roles and allows only work with enough lead time."}</p>} />
                <div className="text-xs text-gray-500">{isGerman ? "Schützt zeitkritische CC-Aufträge vor DB-Zuweisungen mit kurzer Restlaufzeit." : "Protects time-critical CC tasks from DB assignments with low remaining time."}</div>
              </div>
              <Switch
                checked={asBoolean(config.allow_cc_if_remaining_gt_24h, true)}
                onCheckedChange={(checked) => applyConfigUpdate((current) => ({ ...current, allow_cc_if_remaining_gt_24h: checked }))}
              />
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
              <LabelWithInfo label={t("rules.blockedTicketTypes")} help={<p>{isGerman ? "Alles, was hier markiert ist, wird für Deutsche-Börse-Rollen vollständig gesperrt, auch wenn andere Regeln den Typ theoretisch erlauben würden." : "Everything selected here is fully blocked for Deutsche Börse roles even if other rules would theoretically allow the type."}</p>} className="mb-2 text-sm font-medium" />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {TICKET_TYPE_OPTIONS.map((ticketType) => (
                  <label key={ticketType} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={asArray(config.deny).includes(ticketType)}
                      onCheckedChange={(checked) => toggleArrayValue("deny", ticketType, checked === true)}
                    />
                    <span>{ticketType}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );

      case "cross_connect_only":
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
              <LabelWithInfo label={t("rules.allowedCcTicketTypes")} help={<p>{isGerman ? "Grundsatzliste für Tickets, die einer Cross-Connect-Rolle überhaupt zugewiesen werden dürfen." : "Baseline list of tickets that may be assigned to a Cross Connect role at all."}</p>} className="mb-2 text-sm font-medium" />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {TICKET_TYPE_OPTIONS.map((ticketType) => (
                  <label key={ticketType} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={asArray(config.allow).includes(ticketType)}
                      onCheckedChange={(checked) => toggleArrayValue("allow", ticketType, checked === true)}
                    />
                    <span>{ticketType}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
              <LabelWithInfo label={t("rules.mixableTicketTypes")} help={<p>{isGerman ? "Hier wird explizit festgelegt, welche Tickettypen parallel zu bestehenden Cross-Connect-Tickets erlaubt sind. Leere Liste bedeutet: keine freie Mischung, nur die definierte TT-Ausnahme bleibt aktiv." : "Explicitly defines which ticket types are allowed alongside existing Cross Connect tickets. An empty list means no free mixing and only the defined TT exception stays active."}</p>} className="mb-2 text-sm font-medium" />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {TICKET_TYPE_OPTIONS.filter((ticketType) => ticketType !== "CrossConnect").map((ticketType) => (
                  <label key={`mixed-${ticketType}`} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={asArray(config.allow_mixed_types).includes(ticketType)}
                      onCheckedChange={(checked) => toggleArrayValue("allow_mixed_types", ticketType, checked === true)}
                    />
                    <span>{ticketType}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                <div>
                  <LabelWithInfo label={t("rules.ttExceptionResourceShortage")} help={<p>{isGerman ? "Erlaubt Trouble Tickets zusätzlich zu CC-Tickets nur dann, wenn ODIN im Ressourcenmangel läuft und die Restzeit-Schwelle erfüllt ist." : "Allows Trouble Tickets in addition to CC tickets only when ODIN is short on resources and the remaining-time threshold is met."}</p>} />
                  <div className="text-xs text-gray-500">{isGerman ? "Lässt Trouble Tickets zu, wenn die Restzeit den Schwellwert erfüllt." : "Allows Trouble Tickets when the remaining-time threshold is met."}</div>
                </div>
                <Switch
                  checked={asBoolean(config.allow_tt_when_insufficient_resources, true)}
                  onCheckedChange={(checked) => applyConfigUpdate((current) => ({ ...current, allow_tt_when_insufficient_resources: checked }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                <div>
                  <LabelWithInfo label={t("rules.mixOnlySameSystem")} help={<p>{isGerman ? "Zusatzschutz für CC-Mischung: andere Tickettypen sind nur erlaubt, wenn das System mit den vorhandenen CC-Tickets identisch ist." : "Additional safeguard for CC mixing: other ticket types are allowed only if the system matches the existing CC tickets."}</p>} />
                  <div className="text-xs text-gray-500">{isGerman ? "Verhindert CC-Mix über verschiedene Systeme hinweg." : "Prevents CC mixing across different systems."}</div>
                </div>
                <Switch
                  checked={asBoolean(config.allow_same_system_only, false)}
                  onCheckedChange={(checked) => applyConfigUpdate((current) => ({ ...current, allow_same_system_only: checked }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                <div>
                  <LabelWithInfo label={t("rules.mixOnlySamePriority")} help={<p>{isGerman ? "Wenn aktiv, dürfen zusätzliche Tickets nur dann gemischt werden, wenn ihre Priorität zur bestehenden CC-Arbeit passt." : "If enabled, extra tickets may only be mixed if their priority matches the existing CC work."}</p>} />
                  <div className="text-xs text-gray-500">{isGerman ? "Hält CC-Arbeitspakete auf derselben Eskalationsstufe." : "Keeps CC work packages on the same escalation level."}</div>
                </div>
                <Switch
                  checked={asBoolean(config.same_priority_only, false)}
                  onCheckedChange={(checked) => applyConfigUpdate((current) => ({ ...current, same_priority_only: checked }))}
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
              <LabelWithInfo label={t("rules.ttExceptionRemainingTime")} help={<p>{isGerman ? "Mindestrestzeit in Stunden, damit ein Worker mit bestehenden CC-Tickets zusätzlich Trouble Tickets erhalten darf." : "Minimum remaining time in hours before a worker with existing CC tickets may also receive Trouble Tickets."}</p>} className="mb-2 text-sm font-medium" />
              <div className="mb-3 text-xs text-gray-500">{isGerman ? "Wenn aktiviert, dürfen Trouble Tickets nur ab dieser verbleibenden Stundenzahl gemischt werden." : "If enabled, Trouble Tickets may only be mixed from this remaining-hour threshold onward."}</div>
              <Input
                type="number"
                min={0}
                value={asNumber(config.min_remaining_hours_for_tt, 24)}
                onChange={(event) => applyConfigUpdate((current) => ({ ...current, min_remaining_hours_for_tt: Number(event.target.value || 0) }))}
              />
            </div>
          </div>
        );

      case "max_sh_per_system": {
        const value = asNumber(config.max, 3);
        return (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <div className="mb-3 flex items-center justify-between text-sm font-medium">
              <LabelWithInfo label={t("rules.maxShPerWorkerSystem")} help={<p>{isGerman ? "Begrenzt Smart-Hands-Aufträge auf einem einzelnen System pro Worker. So werden Monopole auf einem System vermieden." : "Limits Smart Hands tasks on a single system per worker to avoid monopolies on one system."}</p>} />
              <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-300">{value}</span>
            </div>
            <Slider value={[value]} min={1} max={10} step={1} onValueChange={(values) => applyConfigUpdate((current) => ({ ...current, max: values[0] ?? 3 }))} />
          </div>
        );
      }

      case "similar_time_threshold": {
        const value = asNumber(config.threshold_hours, 6);
        return (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <div className="mb-3 flex items-center justify-between text-sm font-medium">
              <LabelWithInfo label={t("rules.maxTimeDiffCcGrouping")} help={<p>{isGerman ? "Je kleiner der Wert, desto ähnlicher müssen zwei Cross-Connect-Restzeiten sein, damit ODIN sie zusammen betrachtet." : "The smaller the value, the more similar two Cross Connect remaining times must be for ODIN to consider them together."}</p>} />
              <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-300">{value}h</span>
            </div>
            <Slider value={[value]} min={1} max={24} step={1} onValueChange={(values) => applyConfigUpdate((current) => ({ ...current, threshold_hours: values[0] ?? 6 }))} />
          </div>
        );
      }

      case "load_balancing": {
        const value = String(config.mode || "least_workload");
        return (
          <div className="grid gap-2">
            {[
              { value: "least_workload", label: t("rules.fewestTicketsFirst"), description: isGerman ? "Bevorzugt Mitarbeiter mit der geringsten aktiven Last." : "Prefers employees with the lowest active workload." },
              { value: "stable_order", label: t("rules.stableOrder"), description: isGerman ? "Belässt die Lastverteilung konstant und priorisiert deterministische Auswahl." : "Keeps workload distribution stable and prioritizes deterministic selection." },
            ].map((option) => {
              const active = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => applyConfigUpdate((current) => ({ ...current, mode: option.value }))}
                  className={`rounded-xl border px-4 py-3 text-left transition ${active
                    ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    : "border-gray-200 bg-gray-50 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800/40"
                  }`}
                >
                  <LabelWithInfo label={option.label} className="text-sm font-medium" help={<p>{option.description}</p>} />
                  <div className="text-xs text-gray-500">{option.description}</div>
                </button>
              );
            })}
          </div>
        );
      }

      case "max_tickets_per_worker": {
        const value = asNumber(config.max, 0);
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
              <div className="mb-3 flex items-center justify-between text-sm font-medium">
                <span>{t("rules.overallTicketLimit")}</span>
                <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-300">{value === 0 ? t("rules.noLimit") : value}</span>
              </div>
              <Slider value={[value]} min={0} max={20} step={1} onValueChange={(values) => applyConfigUpdate((current) => ({ ...current, max: values[0] ?? 0 }))} />
            </div>

            {renderNumberMapEditor(
              t("rules.limitsPerTicketType"),
              isGerman ? "Überschreibt das globale Limit für einzelne Ticketarten." : "Overrides the global limit for individual ticket types.",
              "per_type",
              TICKET_TYPE_OPTIONS.map((ticketType) => ({ value: ticketType, label: ticketType })),
              <p>{isGerman ? "Wenn gesetzt, greift für diesen Tickettyp ein eigener Cap statt nur des globalen Worker-Limits." : "If set, a dedicated cap applies for this ticket type instead of only the global worker limit."}</p>,
            )}

            {renderNumberMapEditor(
              t("rules.limitsPerRole"),
              isGerman ? "Separate Obergrenzen für Dispatcher, CC, Support und weitere Rollen." : "Separate upper bounds for Dispatcher, CC, Support, and other roles.",
              "per_role",
              roleOptions,
              <p>{isGerman ? "Rollen-Caps sind sinnvoll, wenn einzelne Spezialrollen trotz globalem Limit bewusst stärker oder schwächer ausgelastet werden sollen." : "Role caps are useful when specific specialist roles should intentionally carry more or less load despite the global limit."}</p>,
            )}

            {renderNestedNumberMapEditor(
              t("rules.limitsPerRoleAndType"),
              isGerman ? "Feingranulare Caps, z.B. Cross Connect maximal 2 Trouble Tickets oder 6 CrossConnect-Tickets." : "Fine-grained caps, for example Cross Connect maximum 2 Trouble Tickets or 6 CrossConnect tickets.",
              "per_role_type",
              <p>{isGerman ? "Dies ist die feinste Steuerungsebene: zuerst Rolle, dann Tickettyp. Sie eignet sich für klare Fachregeln pro Spezialrolle." : "This is the finest control level: role first, then ticket type. It is suitable for clear business rules per specialist role."}</p>,
            )}
          </div>
        );
      }

      case "expedite_priority":
        return (
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
            <div>
              <LabelWithInfo label={t("rules.preferExpedite")} help={<p>{isGerman ? "Aktiviert eine Vorzugsbehandlung für Expedite-Tickets innerhalb derselben fachlichen Priorität und desselben Tiers." : "Enables preferential treatment for expedite tickets within the same business priority and tier."}</p>} />
              <div className="text-xs text-gray-500">{isGerman ? "Expedite-Tickets werden innerhalb gleicher Priorität vorgezogen." : "Expedite tickets are preferred within the same priority."}</div>
            </div>
            <Switch
              checked={asBoolean(config.enabled, false)}
              onCheckedChange={(checked) => applyConfigUpdate((current) => ({ ...current, enabled: checked }))}
            />
          </div>
        );

      default:
        return (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-300">
            {t("rules.noVisualEditor")}
          </div>
        );
    }
  };

  if (loading) {
    const loadingContent = (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );

    if (embedded) return loadingContent;

    return (
      <EnterprisePageShell>
        <EnterpriseHeader title={t("rules.title")} subtitle={t("rules.subtitle")} />
        <EnterpriseFeatureHero
          tone="indigo"
          eyebrow={t("rules.subtitle")}
          title={t("rules.title")}
          description={t("rules.subtitle")}
        />
        {loadingContent}
      </EnterprisePageShell>
    );
  }

  const grouped = rules.reduce<Record<string, AssignmentRule[]>>((acc, rule) => {
    (acc[rule.category] ||= []).push(rule);
    return acc;
  }, {});

  const content = (
    <>
      {Object.entries(grouped).map(([category, categoryRules]) => {
        const meta = categoryMeta[category] || { label: category, icon: Brain, color: "text-gray-600", help: <p>{t("rules.noCategoryDescription")}</p> };
        return (
          <div key={category} className="mb-6">
            <h2 className={`mb-3 flex items-center gap-2 text-lg font-semibold ${meta.color}`}>
              <meta.icon className="h-5 w-5" />
              {meta.label}
              <InfoTooltip title={meta.label} side="right" align="start" width="w-96">
                {renderHelpContent(meta.help)}
              </InfoTooltip>
            </h2>

            <div className="space-y-2">
              {categoryRules.sort((left, right) => left.sort_order - right.sort_order).map((rule) => {
                const showAdvanced = !!showAdvancedByRule[rule.rule_key];
                return (
                  <EnterpriseCard key={rule.rule_key}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-1 items-start gap-2">
                        <button onClick={() => expandRule(rule.rule_key)} className="flex flex-1 items-center gap-2 text-left">
                          {expanded === rule.rule_key
                            ? <ChevronDown className="h-4 w-4 text-gray-400" />
                            : <ChevronRight className="h-4 w-4 text-gray-400" />}
                          <div>
                            <div className="text-sm font-medium">{rule.label}</div>
                            <div className="text-xs text-gray-400">{rule.description}</div>
                          </div>
                        </button>
                        <InfoTooltip title={rule.label} side="right" align="start" width="w-96">
                          {renderHelpContent(ruleHelp[rule.rule_key] || rule.description || t("rules.noExplanation"))}
                        </InfoTooltip>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">v{rule.version}</span>
                        <button onClick={() => toggle(rule.rule_key)} className="focus:outline-none">
                          {rule.enabled
                            ? <ToggleRight className="h-6 w-6 text-green-500" />
                            : <ToggleLeft className="h-6 w-6 text-gray-400" />}
                        </button>
                      </div>
                    </div>

                    {expanded === rule.rule_key && (
                      <div className="mt-4 space-y-4 border-t pt-4 dark:border-gray-700">
                        {renderConfigEditor(rule)}

                        <div>
                          <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
                            <span>{t("rules.changeNote")} (optional)</span>
                            <InfoTooltip title={t("rules.changeNote")} side="right" align="start">
                              <p>{isGerman ? "Kurze fachliche Begründung für das Audit-Log, z. B. warum ein Cap oder eine Rollenregel geändert wurde." : "Short business explanation for the audit log, for example why a cap or role rule was changed."}</p>
                            </InfoTooltip>
                          </div>
                          <Input
                            value={changeNote}
                            onChange={(event) => setChangeNote(event.target.value)}
                            placeholder={t("rules.changeNotePlaceholder")}
                          />
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/30">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setShowAdvancedByRule((prev) => ({ ...prev, [rule.rule_key]: !prev[rule.rule_key] }))}
                              className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                            >
                              <Wrench className="h-4 w-4" />
                              {showAdvanced ? t("rules.hideAdvancedJson") : t("rules.showAdvancedJson")}
                            </button>
                            <InfoTooltip title={isGerman ? "Erweiterter JSON-Modus" : "Advanced JSON mode"} side="right" align="start" width="w-96">
                              <p>{isGerman ? "Direkte Bearbeitung der Regelkonfiguration für Sonderfälle oder neue Felder. Die Eingabe überschreibt die visuellen Controls dieser Regel." : "Direct editing of the rule configuration for special cases or new fields. Input here overrides the visual controls of this rule."}</p>
                            </InfoTooltip>
                          </div>
                          {showAdvanced && (
                            <div className="mt-3 space-y-2">
                              <div className="text-xs text-gray-500">{t("rules.advancedJsonOnlySpecial")}</div>
                              <Textarea value={editingJson} onChange={(event) => setEditingJson(event.target.value)} className="min-h-45 font-mono text-xs" />
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => saveRule(rule.rule_key)} disabled={saving} className="flex items-center gap-2 rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {t("common.save")}
                          </button>
                          <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 rounded bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">
                            <History className="h-4 w-4" />
                            {t("rules.history")} ({history.length})
                          </button>
                        </div>

                        <div className="text-xs text-gray-400">
                          {t("rules.version")} {rule.version} · {t("rules.lastChangedBy")} {rule.updated_by || "System"} {isGerman ? "am" : "on"} {new Date(rule.updated_at).toLocaleString(isGerman ? "de-DE" : "en-GB", { timeZone: 'Europe/Berlin' })}
                        </div>

                        {showHistory && history.length > 0 && (
                          <div className="mt-3 space-y-2 border-t pt-3 dark:border-gray-700">
                            <h4 className="text-xs font-semibold text-gray-500">{t("rules.changeHistory")}</h4>
                            {history.map((entry) => (
                              <div key={entry.id} className="flex items-start justify-between rounded bg-gray-50 p-2 text-xs dark:bg-gray-800/50">
                                <div className="space-y-1">
                                  <div className="font-medium">v{entry.version} – {entry.changed_by || "System"}</div>
                                  <div className="text-gray-400">{new Date(entry.created_at).toLocaleString(isGerman ? "de-DE" : "en-GB", { timeZone: 'Europe/Berlin' })}</div>
                                  {entry.change_note && <div className="italic text-gray-500">{entry.change_note}</div>}
                                </div>
                                <button
                                  onClick={() => rollback(rule.rule_key, entry.version)}
                                  className="flex items-center gap-1 rounded px-2 py-1 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/20"
                                >
                                  <RotateCcw className="h-3 w-3" /> {t("rules.rollback")}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </EnterpriseCard>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );

  if (embedded) return content;

  return (
    <EnterprisePageShell>
      <EnterpriseHeader title={t("rules.titleAlt")} subtitle={t("rules.subtitleAlt")} />
      <EnterpriseFeatureHero
        tone="indigo"
        eyebrow={t("rules.subtitleAlt")}
        title={t("rules.titleAlt")}
        description={t("rules.subtitle")}
        metrics={[
          { label: "Rules", value: rules.length },
          { label: "Groups", value: Object.keys(grouped).length },
          { label: "Engine", value: "ODIN" },
        ]}
      />
      {content}
    </EnterprisePageShell>
  );
}