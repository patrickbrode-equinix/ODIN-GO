/* ------------------------------------------------ */
/* USERS – USER MANAGEMENT PAGE                     */
/* ------------------------------------------------ */

import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Users as UsersIcon, CalendarHeart, Pencil, Save, X, ChevronDown, ChevronUp, Download } from "lucide-react";
import { EnterprisePageShell, EnterpriseCard, EnterpriseFeatureHero, EnterpriseHeader } from "../layout/EnterpriseLayout";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";

import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/api";
import { useLanguage, getLanguageLocale } from "../../context/LanguageContext";
import { formatAbsoluteDateTime, formatRelativeTime } from "../../utils/loginStatus";

import { AddUserModal } from "../users/AddUserModal";

/* ------------------------------------------------ */
/* TYPES                                           */
/* ------------------------------------------------ */

interface User {
  id: number;
  firstName: string | null;
  lastName: string | null;
  loginName: string | null;
  email: string | null;
  group: string;
  department?: string | null;
  approved: boolean;
  isAdmin: boolean;
  isRoot?: boolean;
  provisionedFromShiftplan?: boolean;
  shiftplanManual?: boolean;
  provisionedEmployeeName?: string | null;
  hasShiftPreferences?: boolean;
  lastLogin?: string | null;
  createdAt: string;
}

interface UserPreferences {
  preferredShifts?: string[];
  unwantedShifts?: string[];
  preferredHolidays?: string[];
  maxNightsPerMonth?: number | null;
  preferredDays?: string[];
  blockedDays?: string[];
  avoidColleagues?: string[];
  workloadPreference?: string | null;
  monthlyPreferences?: Record<string, unknown> | null;
  notes?: string | null;
  updatedAt?: string | null;
}

/* ------------------------------------------------ */
/* HELPERS                                         */
/* ------------------------------------------------ */

function getDisplayName(user: User) {
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.loginName || user.email || "-";
}

const USERS_COPY = {
  de: {
    title: "USER MANAGEMENT",
    subtitle: "Mitarbeiter, Rechte und Jarvis-SSO-Zuordnung verwalten",
    addUser: "User anlegen",
    introExternal: "Alle Mitarbeiter werden über ihre Equinix-E-Mail eindeutig der Jarvis-SSO-Identität zugeordnet. Es gibt keine Mitarbeiterpasswörter.",
    introCompetence: "Kompetenzprofile werden in den Schichtplan-Einstellungen gepflegt und hier nur zur Einordnung angezeigt.",
    user: "User",
    department: "Abteilung",
    source: "Quelle",
    competence: "Kompetenz",
    login: "Jarvis SSO",
    role: "Rolle",
    status: "Status",
    actions: "Aktionen",
    loading: "User werden geladen…",
    empty: "Keine User gefunden",
    shiftplan: "Shiftplan",
    external: "Extern / anderes Team",
    noProfile: "Noch kein Profil",
    profile: "Profil",
    neverLoggedIn: "E-Mail fehlt",
    lastLogin: "SSO bereit",
    ago: "vor",
    active: "Aktiv",
    pending: "Ausstehend",
    root: "Root",
    admin: "Admin",
    userRole: "User",
    rights: "Rechte",
    approve: "Freigeben",
    delete: "Loeschen",
    deleteConfirm: "User wirklich loeschen?",
    deleteFinal: "Dieser Vorgang ist endgueltig.",
    adminToggle: "Admin",
    shiftPrefs: "Dienstwünsche",
    shiftPrefsYes: "Konfiguriert",
    shiftPrefsNo: "Nicht konfiguriert",
    lastLoginAt: "Zuletzt eingeloggt",
    neverLoggedInAt: "Noch nie eingeloggt",
  },
  en: {
    title: "USER MANAGEMENT",
    subtitle: "Manage employees, access rights, and Jarvis SSO mapping",
    addUser: "Add user",
    introExternal: "Every employee is mapped to their Jarvis SSO identity through the Equinix email address. Employee passwords are not used.",
    introCompetence: "Competence profiles stay in shift admin settings and are shown here as read-only context.",
    user: "User",
    department: "Department",
    source: "Source",
    competence: "Competence",
    login: "Jarvis SSO",
    role: "Role",
    status: "Status",
    actions: "Actions",
    loading: "Loading users…",
    empty: "No users found",
    shiftplan: "Shiftplan",
    external: "External / other team",
    noProfile: "No profile yet",
    profile: "Profile",
    neverLoggedIn: "Email missing",
    lastLogin: "SSO ready",
    ago: "ago",
    active: "Active",
    pending: "Pending",
    root: "Root",
    admin: "Admin",
    userRole: "User",
    rights: "Rights",
    approve: "Approve",
    delete: "Delete",
    deleteConfirm: "Delete user now?",
    deleteFinal: "This action is permanent.",
    adminToggle: "Admin",
    shiftPrefs: "Shift preferences",
    shiftPrefsYes: "Configured",
    shiftPrefsNo: "Not configured",
    lastLoginAt: "Last login",
    neverLoggedInAt: "Never logged in",
  },
  ro: {
    title: "USER MANAGEMENT",
    subtitle: "Administrare utilizatori, drepturi si stare de login",
    addUser: "Adauga utilizator",
    introExternal: "Aici pot fi creati si utilizatori care nu exista in planul de ture, de exemplu pentru alte echipe sau doar pentru distributia tichetelor.",
    introCompetence: "Profilurile de competenta raman in setarile de administrare a turelor si sunt afisate aici doar informativ.",
    user: "Utilizator",
    department: "Departament",
    source: "Sursa",
    competence: "Competenta",
    login: "Login",
    role: "Rol",
    status: "Stare",
    actions: "Actiuni",
    loading: "Se incarca utilizatorii…",
    empty: "Nu au fost gasiti utilizatori",
    shiftplan: "Shiftplan",
    external: "Extern / alta echipa",
    noProfile: "Inca fara profil",
    profile: "Profil",
    neverLoggedIn: "Nu s-a autentificat niciodata",
    lastLogin: "Ultima autentificare",
    ago: "in urma",
    active: "Activ",
    pending: "In asteptare",
    root: "Root",
    admin: "Admin",
    userRole: "Utilizator",
    rights: "Drepturi",
    approve: "Aproba",
    delete: "Sterge",
    deleteConfirm: "Stergi acest utilizator?",
    deleteFinal: "Aceasta actiune este definitiva.",
    adminToggle: "Admin",
    shiftPrefs: "Preferinte ture",
    shiftPrefsYes: "Configurat",
    shiftPrefsNo: "Neconfigurat",
    lastLoginAt: "Ultima autentificare",
    neverLoggedInAt: "Nu s-a autentificat niciodata",
  },
  ar: {
    title: "إدارة المستخدمين",
    subtitle: "إدارة المستخدمين والصلاحيات وحالة تسجيل الدخول",
    addUser: "إضافة مستخدم",
    introExternal: "يمكن أيضاً إنشاء مستخدمين غير موجودين في خطة الشفت، مثلاً لفرق أخرى أو لتوزيع التذاكر فقط.",
    introCompetence: "تبقى ملفات الكفاءة في إعدادات إدارة الشفت وتُعرض هنا للقراءة فقط.",
    user: "المستخدم",
    department: "القسم",
    source: "المصدر",
    competence: "الكفاءة",
    login: "تسجيل الدخول",
    role: "الدور",
    status: "الحالة",
    actions: "الإجراءات",
    loading: "جارٍ تحميل المستخدمين…",
    empty: "لم يتم العثور على مستخدمين",
    shiftplan: "Shiftplan",
    external: "خارجي / فريق آخر",
    noProfile: "لا يوجد ملف بعد",
    profile: "الملف",
    neverLoggedIn: "لم يسجل الدخول من قبل",
    lastLogin: "آخر تسجيل دخول",
    ago: "منذ",
    active: "نشط",
    pending: "قيد الانتظار",
    root: "Root",
    admin: "Admin",
    userRole: "مستخدم",
    rights: "الصلاحيات",
    approve: "اعتماد",
    delete: "حذف",
    deleteConfirm: "هل تريد حذف هذا المستخدم؟",
    deleteFinal: "هذا الإجراء نهائي.",
    adminToggle: "Admin",
    shiftPrefs: "تفضيلات الورديات",
    shiftPrefsYes: "مُعَد",
    shiftPrefsNo: "غير مُعَد",
    lastLoginAt: "آخر تسجيل دخول",
    neverLoggedInAt: "لم يسجل الدخول بعد",
  },
} as const;

function getSsoDotClass(hasSsoIdentity: boolean) {
  return hasSsoIdentity ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]" : "bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.45)]";
}

/* ------------------------------------------------ */
/* COMPONENT                                       */
/* ------------------------------------------------ */

export default function Users() {
  const { canAccess } = useAuth();
  const { language } = useLanguage();
  const locale = getLanguageLocale(language);
  const copy = USERS_COPY[language as keyof typeof USERS_COPY] || USERS_COPY.en;

  /* 🔑 WRITE = darf verwalten */
  const canManageUsers = canAccess("user_management", "write");

  /* ------------------------------------------------ */
  /* STATE                                           */
  /* ------------------------------------------------ */

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<{ firstName: string; lastName: string; } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [preferenceDetails, setPreferenceDetails] = useState<Record<number, UserPreferences | null>>({});
  const [userMessage, setUserMessage] = useState("");

  /* ------------------------------------------------ */
  /* LOAD USERS                                      */
  /* ------------------------------------------------ */

  async function loadUsers() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await api.get<User[]>("/admin/users");
      const list = Array.isArray(res.data) ? res.data : [];
      setUsers(list);
    } catch (err: any) {
      console.error("LOAD USERS ERROR:", err);
      setLoadError(err?.response?.data?.message || "Die Mitarbeiter konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  /* ------------------------------------------------ */
  /* DELETE USER                                     */
  /* ------------------------------------------------ */

  async function deleteUser(userId: number, email: string) {
    const ok = window.confirm(
      `${copy.deleteConfirm}\n\n${email}\n\n${copy.deleteFinal}`
    );
    if (!ok) return;

    try {
      await api.delete(`/admin/users/${userId}`);
      loadUsers();
    } catch (err) {
      console.error("DELETE USER ERROR:", err);
      loadUsers();
    }
  }

  async function togglePreferences(userId: number) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }

    setExpandedUserId(userId);
    if (Object.prototype.hasOwnProperty.call(preferenceDetails, userId)) return;

    try {
      const res = await api.get(`/admin/users/${userId}/preferences`);
      setPreferenceDetails((prev) => ({ ...prev, [userId]: res.data?.preferences || null }));
    } catch (err) {
      console.error("LOAD USER PREFERENCES ERROR:", err);
      setPreferenceDetails((prev) => ({ ...prev, [userId]: null }));
    }
  }

  async function exportPreferencesMarkdown() {
    if (!canManageUsers || users.length === 0) return;
    setUserMessage("Wünsche werden exportiert …");
    const rows = await Promise.all(users.map(async (user) => {
      try {
        const response = await api.get(`/admin/users/${user.id}/preferences`);
        return { user, preferences: response.data?.preferences || null };
      } catch {
        return { user, preferences: null };
      }
    }));
    const lines = [
      "# Mitarbeiterwünsche",
      "",
      `Export erstellt: ${new Date().toLocaleString(locale)}`,
      `Anzahl Mitarbeiter: ${rows.length}`,
      "",
    ];
    for (const { user, preferences } of rows) {
      const name = getDisplayName(user);
      lines.push(`## ${name}`);
      lines.push(`- E-Mail: ${user.email || user.loginName || "–"}`);
      lines.push(`- Letzter Login: ${user.lastLogin ? formatAbsoluteDateTime(user.lastLogin, locale) : "–"}`);
      if (!preferences) { lines.push("- Keine Wünsche gespeichert.", ""); continue; }
      const labels: Array<[string, unknown]> = [
        ["Bevorzugte Schichten", preferences.preferredShifts],
        ["Unerwünschte Schichten", preferences.unwantedShifts],
        ["Bevorzugte Feiertage", preferences.preferredHolidays],
        ["Bevorzugte Tage", preferences.preferredDays],
        ["Gesperrte Tage", preferences.blockedDays],
        ["Zu vermeidende Kollegen", preferences.avoidColleagues],
        ["Max. Nachtschichten/Monat", preferences.maxNightsPerMonth],
        ["Arbeitslastpräferenz", preferences.workloadPreference],
        ["Monatliche Präferenzen", preferences.monthlyPreferences],
        ["Notizen", preferences.notes],
        ["Zuletzt geändert", preferences.updatedAt ? formatAbsoluteDateTime(preferences.updatedAt, locale) : null],
      ];
      for (const [label, value] of labels) lines.push(`- ${label}: ${renderPreferenceValue(value)}`);
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `mitarbeiterwuensche-${new Date().toISOString().slice(0, 10)}.md`; anchor.click();
    URL.revokeObjectURL(url);
    setUserMessage("Markdown-Export wurde erstellt.");
  }

  function renderPreferenceValue(value: unknown) {
    if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "–";
    if (value == null || value === "") return "–";
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return "–";
      return entries.map(([key, entry]) => `${key}: ${renderPreferenceValue(entry)}`).join("; ");
    }
    return String(value);
  }

  function renderPreferenceChips(value: unknown, tone: "default" | "success" | "warning" | "danger" = "default") {
    const entries = Array.isArray(value)
      ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : String(value ?? "").trim()
        ? [String(value)]
        : [];
    if (entries.length === 0) {
      return <span className="text-xs text-muted-foreground">Keine Angabe</span>;
    }

    const toneClass = {
      default: "border-slate-500/30 bg-slate-500/10 text-slate-200",
      success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      danger: "border-red-500/30 bg-red-500/10 text-red-300",
    }[tone];

    return (
      <div className="flex flex-wrap gap-1.5">
        {entries.map((entry) => (
          <Badge key={entry} variant="outline" className={`${toneClass} text-[11px] font-semibold`}>
            {entry}
          </Badge>
        ))}
      </div>
    );
  }

  function renderPreferenceCard(title: string, description: string, content: ReactNode, accent: string) {
    return (
      <div className={`rounded-xl border ${accent} bg-background/60 p-3 shadow-sm`}>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        <div className="mt-3">{content}</div>
      </div>
    );
  }

  function renderLastLogin(value: string | null | undefined) {
    if (!value) return <span className="text-xs text-muted-foreground">{copy.neverLoggedInAt}</span>;
    const absolute = formatAbsoluteDateTime(value, locale);
    const relative = formatRelativeTime(value, locale);
    return (
      <div>
        <div className="text-sm font-medium text-foreground">{absolute || copy.neverLoggedInAt}</div>
        {relative ? <div className="mt-0.5 text-xs text-muted-foreground">{relative}</div> : null}
      </div>
    );
  }

  function startEditing(user: User) {
    setEditingUserId(user.id);
    setSavingEdit(false);
    setEditError("");
    setEditingDraft({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
    });
  }

  function cancelEditing() {
    setEditingUserId(null);
    setEditingDraft(null);
    setSavingEdit(false);
    setEditError("");
  }

  async function saveEditing(userId: number) {
    if (!editingDraft) return;

    setSavingEdit(true);
    setEditError("");

    try {
      await api.patch(`/admin/users/${userId}`, {
        firstName: editingDraft.firstName.trim(),
        lastName: editingDraft.lastName.trim(),
      });
      cancelEditing();
      await loadUsers();
    } catch (err: any) {
      setEditError(err?.response?.data?.message || "Unable to save user changes.");
      setSavingEdit(false);
    }
  }

  const userRows = useMemo(
    () => users.map((user) => ({
      user,
      displayName: getDisplayName(user),
    })),
    [users]
  );

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <EnterprisePageShell>
      {/* HEADER */}
      <EnterpriseHeader
        title={copy.title}
        subtitle={<span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{copy.subtitle}</span>}
        icon={<UsersIcon className="w-5 h-5 text-indigo-400" />}
        rightContent={
          canManageUsers && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 px-3 text-[11px] font-bold tracking-wider uppercase" onClick={() => void exportPreferencesMarkdown()} disabled={loading || users.length === 0}>
                <Download className="w-3.5 h-3.5 mr-2" /> Wünsche exportieren
              </Button>
              <Button
                size="sm"
                className="h-7 px-3 text-[11px] font-bold tracking-wider uppercase bg-indigo-600/90 hover:bg-indigo-600 text-white shadow-sm border-transparent"
                onClick={() => setAddUserOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-2" />
                {copy.addUser}
              </Button>
            </div>
          )
        }
      />

      <EnterpriseFeatureHero
        tone="cyan"
        eyebrow={copy.subtitle}
        title={copy.title}
        description={copy.introExternal}
        metrics={[
          { label: copy.user, value: loading ? copy.loading : users.length },
          { label: copy.actions, value: canManageUsers ? copy.addUser : "Read only" },
          { label: "Identitaet", value: "Jarvis SSO" },
        ]}
      />

      <EnterpriseCard className="mb-4">
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{copy.introExternal}</p>
          {userMessage ? <p className="font-semibold text-cyan-300">{userMessage}</p> : null}
        </div>
      </EnterpriseCard>

      {/* TABLE */}
      <EnterpriseCard
        noPadding
        className="flex flex-1 min-h-0 flex-col overflow-hidden"
        style={{ background: "transparent", border: "0", boxShadow: "none" }}
      >
        <div className="overflow-auto border rounded-xl bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.user}</TableHead>
                <TableHead>{language === "de" ? "E-Mail" : "Email"}</TableHead>
                <TableHead>{copy.lastLoginAt}</TableHead>
                <TableHead>{copy.source}</TableHead>
                <TableHead>{copy.shiftPrefs}</TableHead>
                <TableHead className="text-right">{copy.actions}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-[13px] text-[#4b5563]">
                    {copy.loading}
                  </TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <div className="mx-auto max-w-lg rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      <div className="font-semibold">Mitarbeiter konnten nicht geladen werden</div>
                      <div className="mt-1 text-xs text-red-300/80">{loadError}</div>
                      <Button type="button" size="sm" variant="outline" className="mt-3 border-red-400/30 text-red-200 hover:bg-red-500/10" onClick={() => void loadUsers()}>
                        Erneut laden
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-[13px] text-[#4b5563]">
                    {copy.empty}
                  </TableCell>
                </TableRow>
              ) : (
                userRows.map(({ user, displayName }) => {
                  const isEditing = editingUserId === user.id && editingDraft !== null;
                  const hasSsoIdentity = Boolean(user.email);

                  const prefs = preferenceDetails[user.id];
                  return (
                    <Fragment key={user.id}>
                    <TableRow>
                      <TableCell className="font-medium">
                        {isEditing && editingDraft ? (
                          <div className="space-y-2">
                            <Input
                              value={editingDraft.firstName}
                              onChange={(event) => setEditingDraft({ ...editingDraft, firstName: event.target.value })}
                            />
                            <Input
                              value={editingDraft.lastName}
                              onChange={(event) => setEditingDraft({ ...editingDraft, lastName: event.target.value })}
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => togglePreferences(user.id)}
                            className="flex items-center gap-2 text-left hover:text-blue-300"
                            title={expandedUserId === user.id ? (language === "de" ? "Wuensche ausblenden" : "Hide wishes") : (language === "de" ? "Wuensche anzeigen" : "Show wishes")}
                          >
                            {expandedUserId === user.id ? <ChevronUp className="h-4 w-4 text-blue-300" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${getSsoDotClass(hasSsoIdentity)}`} />
                            <span>{displayName}</span>
                          </button>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${getSsoDotClass(hasSsoIdentity)}`} />
                          <span>{user.email || "-"}</span>
                        </div>
                      </TableCell>

                      <TableCell>{renderLastLogin(user.lastLogin)}</TableCell>

                      <TableCell>
                        {user.provisionedFromShiftplan && !user.shiftplanManual ? (
                          <Badge className="border-cyan-500/30 bg-cyan-500/15 text-cyan-300">
                            {copy.shiftplan}
                          </Badge>
                        ) : (
                          <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-300">
                            {language === "de" ? "Manuell / leere Planzeile" : "Manual / empty schedule row"}
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          {user.hasShiftPreferences ? (
                            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                              <CalendarHeart className="w-3 h-3 mr-1" />
                              {copy.shiftPrefsYes}
                            </Badge>
                          ) : (
                            <Badge className="border-slate-500/30 bg-slate-500/15 text-slate-400">
                              {copy.shiftPrefsNo}
                            </Badge>
                          )}
                          <span
                            className={`inline-flex h-3 w-3 shrink-0 rounded-full ${user.hasShiftPreferences ? "bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.55)]" : "border border-slate-600 bg-slate-800"}`}
                            title={user.hasShiftPreferences ? (language === "de" ? "Wuensche wurden abgegeben" : "Preferences submitted") : (language === "de" ? "Keine Wuensche abgegeben" : "No preferences submitted")}
                            aria-label={user.hasShiftPreferences ? copy.shiftPrefsYes : copy.shiftPrefsNo}
                          />
                        </div>
                      </TableCell>

                      <TableCell className="text-right space-x-1">
                        {editError && isEditing ? (
                          <div className="mb-2 text-xs text-red-400">{editError}</div>
                        ) : null}

                        {canManageUsers ? (
                          isEditing ? (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                title={language === "de" ? "Speichern" : "Save"}
                                onClick={() => saveEditing(user.id)}
                                disabled={savingEdit}
                              >
                                <Save className="w-4 h-4 text-emerald-500" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title={language === "de" ? "Abbrechen" : "Cancel"}
                                onClick={cancelEditing}
                                disabled={savingEdit}
                              >
                                <X className="w-4 h-4 text-slate-400" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={language === "de" ? "Bearbeiten" : "Edit"}
                              onClick={() => startEditing(user)}
                            >
                              <Pencil className="w-4 h-4 text-cyan-400" />
                            </Button>
                          )
                        ) : null}

                        {canManageUsers && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title={copy.delete}
                            onClick={() =>
                              deleteUser(user.id, user.loginName || user.email || displayName)
                            }
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandedUserId === user.id ? (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/20">
                          {prefs ? (
                            <div className="space-y-3 [&>div:not(:first-child)]:hidden">
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-bold text-foreground">{language === "de" ? "Schichtplan-Wuensche" : "Shift preferences"}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {language === "de" ? "Kompakte Uebersicht fuer die Generatorpruefung." : "Compact overview for checking the generator result."}
                                    </div>
                                  </div>
                                  <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-300">
                                    {prefs.updatedAt ? formatRelativeTime(prefs.updatedAt, locale) : (language === "de" ? "Kein Zeitstempel" : "No timestamp")}
                                  </Badge>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                  {renderPreferenceCard(
                                    language === "de" ? "Bevorzugt" : "Preferred",
                                    language === "de" ? "Diese Schichten und Tage sollen bevorzugt werden." : "These shifts and days should be preferred.",
                                    <div className="space-y-2">
                                      {renderPreferenceChips(prefs.preferredShifts, "success")}
                                      {renderPreferenceChips(prefs.preferredDays, "success")}
                                    </div>,
                                    "border-emerald-500/20"
                                  )}
                                  {renderPreferenceCard(
                                    language === "de" ? "Nicht planen" : "Avoid",
                                    language === "de" ? "Diese Angaben sind fuer den Generator kritisch." : "These values are critical for the generator.",
                                    <div className="space-y-2">
                                      {renderPreferenceChips(prefs.unwantedShifts, "danger")}
                                      {renderPreferenceChips(prefs.blockedDays, "danger")}
                                    </div>,
                                    "border-red-500/25"
                                  )}
                                  {renderPreferenceCard(
                                    language === "de" ? "Feiertage" : "Holidays",
                                    language === "de" ? "Gewuenschte Feiertagseinsaetze." : "Preferred holiday assignments.",
                                    renderPreferenceChips(prefs.preferredHolidays, "warning"),
                                    "border-amber-500/20"
                                  )}
                                  {renderPreferenceCard(
                                    language === "de" ? "Belastung" : "Workload",
                                    language === "de" ? "Persoenliche Belastungsgrenzen." : "Personal workload limits.",
                                    <div className="space-y-2 text-xs">
                                      <div><span className="text-muted-foreground">Nachtlimit:</span> <strong>{renderPreferenceValue(prefs.maxNightsPerMonth)}</strong></div>
                                      <div><span className="text-muted-foreground">Arbeitslast:</span> <strong>{renderPreferenceValue(prefs.workloadPreference)}</strong></div>
                                    </div>,
                                    "border-sky-500/20"
                                  )}
                                  {renderPreferenceCard(
                                    language === "de" ? "Kollegen" : "Colleagues",
                                    language === "de" ? "Mitarbeiter, mit denen nicht geplant werden soll." : "Employees that should be avoided.",
                                    renderPreferenceChips(prefs.avoidColleagues, "warning"),
                                    "border-purple-500/20"
                                  )}
                                  {renderPreferenceCard(
                                    language === "de" ? "Notizen" : "Notes",
                                    language === "de" ? "Freitext aus den Mitarbeiterwuenschen." : "Free text from the employee preferences.",
                                    <p className="text-xs leading-relaxed text-foreground">{renderPreferenceValue(prefs.notes)}</p>,
                                    "border-slate-500/20"
                                  )}
                                </div>
                              </div>
                              <div><strong>{language === "de" ? "Gewünschte Schichten" : "Preferred shifts"}:</strong> {renderPreferenceValue(prefs.preferredShifts)}</div>
                              <div><strong>{language === "de" ? "Unerwünschte Schichten" : "Unwanted shifts"}:</strong> {renderPreferenceValue(prefs.unwantedShifts)}</div>
                              <div><strong>{language === "de" ? "Gewünschte Tage" : "Preferred days"}:</strong> {renderPreferenceValue(prefs.preferredDays)}</div>
                              <div><strong>{language === "de" ? "Gesperrte Tage" : "Blocked days"}:</strong> {renderPreferenceValue(prefs.blockedDays)}</div>
                              <div><strong>{language === "de" ? "Feiertagswünsche" : "Holiday wishes"}:</strong> {renderPreferenceValue(prefs.preferredHolidays)}</div>
                              <div><strong>{language === "de" ? "Kollegen vermeiden" : "Avoid colleagues"}:</strong> {renderPreferenceValue(prefs.avoidColleagues)}</div>
                              <div><strong>{language === "de" ? "Arbeitslast" : "Workload"}:</strong> {renderPreferenceValue(prefs.workloadPreference)}</div>
                              <div><strong>{language === "de" ? "Notizen" : "Notes"}:</strong> {renderPreferenceValue(prefs.notes)}</div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">{language === "de" ? "Keine Wünsche eingetragen." : "No wishes entered."}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : null}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </EnterpriseCard>

      <AddUserModal
        open={addUserOpen}
        onClose={() => {
          setAddUserOpen(false);
        }}
        onCreated={loadUsers}
      />

    </EnterprisePageShell>
  );
}
